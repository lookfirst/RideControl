import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIAGNOSTIC_TIMEOUT_MS = 30_000;
const CONTENT_LENGTH_PATTERN = /Content-Length: (\d+)/i;
const DIAGNOSTIC_CANARY = 'export const Canary = () => <div className="p-2 p-4" />;';
const TAILWIND_CSS_SYNTAX_PATTERN =
	/@(?:apply|config|custom-variant|import|plugin|source|tailwind|theme|utility|variant)\b/;
const LEADING_IMPORTANT_MODIFIER_PATTERN = /^!/;
const TRAILING_IMPORTANT_MODIFIER_PATTERN = /!$/;
const LANGUAGE_IDS = new Map([
	['.css', 'css'],
	['.html', 'html'],
	['.js', 'javascript'],
	['.jsx', 'javascriptreact'],
	['.ts', 'typescript'],
	['.tsx', 'typescriptreact'],
]);

const defaultSettings = {
	editor: { tabSize: 4 },
	tailwindCSS: {
		classAttributes: ['class', 'className', 'ngClass', 'class:list'],
		classFunctions: [],
		codeActions: true,
		codeLens: true,
		colorDecorators: true,
		emmetCompletions: false,
		experimental: { classRegex: [], configFile: null },
		files: {
			exclude: ['**/.git/**', '**/dist/**', '**/node_modules/**'],
		},
		hovers: true,
		includeLanguages: {},
		inspectPort: null,
		lint: {
			cssConflict: 'warning',
			deprecatedAtRule: 'warning',
			invalidApply: 'error',
			invalidConfigPath: 'error',
			invalidScreen: 'error',
			invalidSourceDirective: 'error',
			invalidTailwindDirective: 'error',
			invalidVariant: 'error',
			recommendedVariantOrder: 'warning',
			suggestCanonicalClasses: 'warning',
			usedBlocklistedClass: 'warning',
		},
		rootFontSize: 16,
		showPixelEquivalents: true,
		suggestions: true,
		validate: true,
	},
};

interface Diagnostic {
	code?: number | string;
	message: string;
	range: {
		start: { character: number; line: number };
	};
	severity?: number;
}

interface JsonRpcMessage {
	error?: { code: number; message: string };
	id?: number | string;
	method?: string;
	params?: unknown;
	result?: unknown;
}

interface PublishedDiagnostics {
	diagnostics: Diagnostic[];
	uri: string;
}

interface SourceDocument {
	file: string;
	text: string;
	uri: string;
}

interface ClassToken {
	className: string;
	position: { character: number; line: number };
	utility: string;
	variant: string;
}

interface HoverResponse {
	contents: { value: string };
}

interface DiagnosticFailure {
	diagnostic: Diagnostic;
	file: string;
}

interface Deferred<T> {
	promise: Promise<T>;
	reject: (reason: Error) => void;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let reject = (_reason: Error) => undefined;
	let resolve = (_value: T) => undefined;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		reject = rejectPromise;
		resolve = resolvePromise;
	});
	return { promise, reject, resolve };
}

function withTimeout<T>(promise: Promise<T>, description: string): Promise<T> {
	return new Promise((resolvePromise, rejectPromise) => {
		const timer = setTimeout(
			() => rejectPromise(new Error(`Timed out waiting for ${description}.`)),
			DIAGNOSTIC_TIMEOUT_MS
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolvePromise(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				rejectPromise(error);
			}
		);
	});
}

async function sourceFiles(directory: string): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await sourceFiles(path)));
		} else if (LANGUAGE_IDS.has(extname(entry.name))) {
			files.push(path);
		}
	}
	return files;
}

function settingForSection(section: string | undefined) {
	if (!section) {
		return defaultSettings;
	}
	return defaultSettings[section as keyof typeof defaultSettings] ?? {};
}

function diagnosticLevel(severity: number | undefined): string {
	if (severity === 1) {
		return 'error';
	}
	if (severity === 2) {
		return 'warning';
	}
	return 'notice';
}

function positionAt(text: string, offset: number) {
	const beforeOffset = text.slice(0, offset);
	const lastLineBreak = beforeOffset.lastIndexOf('\n');
	return {
		character: offset - lastLineBreak - 1,
		line: beforeOffset.split('\n').length - 1,
	};
}

function utilityParts(className: string) {
	let bracketDepth = 0;
	let lastVariantSeparator = -1;
	for (const [index, character] of [...className].entries()) {
		if (character === '[') {
			bracketDepth += 1;
		} else if (character === ']') {
			bracketDepth -= 1;
		} else if (character === ':' && bracketDepth === 0) {
			lastVariantSeparator = index;
		}
	}
	return {
		utility: className
			.slice(lastVariantSeparator + 1)
			.replace(LEADING_IMPORTANT_MODIFIER_PATTERN, '')
			.replace(TRAILING_IMPORTANT_MODIFIER_PATTERN, ''),
		variant: className.slice(0, lastVariantSeparator + 1),
	};
}

function classLists(text: string): ClassToken[][] {
	const attributePattern =
		/\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([\s\S]*?)`\s*\})/g;
	const lists: ClassToken[][] = [];
	for (const attribute of text.matchAll(attributePattern)) {
		const value = attribute[1] ?? attribute[2] ?? attribute[3];
		const attributeStart = attribute.index ?? 0;
		const valueStart = attributeStart + attribute[0].indexOf(value);
		const tokens = [...value.matchAll(/\S+/g)].map((token) => ({
			className: token[0],
			position: positionAt(text, valueStart + (token.index ?? 0)),
			...utilityParts(token[0]),
		}));
		lists.push(tokens);
	}
	return lists;
}

function containsTailwindSyntax(document: SourceDocument): boolean {
	return (
		classLists(document.text).some((tokens) => tokens.length > 0) ||
		(extname(document.file) === '.css' && TAILWIND_CSS_SYNTAX_PATTERN.test(document.text))
	);
}

async function scopedBorderColorConflicts(
	documents: SourceDocument[],
	request: (method: string, params?: unknown) => Promise<unknown>
): Promise<DiagnosticFailure[]> {
	const failures: DiagnosticFailure[] = [];
	for (const document of documents) {
		for (const tokens of classLists(document.text)) {
			const colorTokens = (
				await Promise.all(
					tokens
						.filter(
							(token) =>
								token.utility.startsWith('border-') ||
								token.utility.startsWith('divide-')
						)
						.map(async (token) => {
							const hover = (await request('textDocument/hover', {
								position: {
									character: token.position.character + 1,
									line: token.position.line,
								},
								textDocument: { uri: document.uri },
							})) as HoverResponse | null;
							if (hover === null) {
								return null;
							}
							return hover.contents.value.includes('border-color:') ? token : null;
						})
				)
			).filter((token): token is ClassToken => token !== null);

			for (const divideToken of colorTokens.filter((token) =>
				token.utility.startsWith('divide-')
			)) {
				const borderTokens = colorTokens.filter(
					(token) =>
						token.utility.startsWith('border-') && token.variant === divideToken.variant
				);
				if (borderTokens.length === 0) {
					continue;
				}
				const borderNames = borderTokens
					.map((token) => `'${token.className}'`)
					.join(' and ');
				failures.push({
					diagnostic: {
						code: 'cssConflict',
						message: `'${divideToken.className}' applies the same CSS property as ${borderNames}.`,
						range: { start: divideToken.position },
						severity: 2,
					},
					file: document.file,
				});
			}
		}
	}
	return failures;
}

async function main() {
	const workspace = process.cwd();
	const workspaceUri = pathToFileURL(workspace).href;
	const server = spawn(
		resolvePath('node_modules/.bin/tailwindcss-language-server'),
		['--stdio'],
		{
			cwd: workspace,
			stdio: ['pipe', 'pipe', 'pipe'],
		}
	);
	const pendingRequests = new Map<number, Deferred<unknown>>();
	const diagnosticWaiters = new Map<string, Deferred<Diagnostic[]>>();
	const documentReadyWaiters = new Map<string, Deferred<void>>();
	const projectReady = deferred<void>();
	const serverReady = deferred<void>();
	let nextRequestId = 1;
	let output = Buffer.alloc(0);
	let serverErrors = '';

	server.stderr.setEncoding('utf8');
	server.stderr.on('data', (chunk: string) => {
		serverErrors += chunk;
	});

	const send = (message: JsonRpcMessage) => {
		const body = JSON.stringify({ jsonrpc: '2.0', ...message });
		server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
	};

	const respond = (id: number | string, result: unknown) => send({ id, result });

	const handleMessage = (message: JsonRpcMessage) => {
		if (message.id !== undefined && !message.method) {
			const request = pendingRequests.get(Number(message.id));
			if (!request) {
				return;
			}
			pendingRequests.delete(Number(message.id));
			if (message.error) {
				request.reject(new Error(message.error.message));
			} else {
				request.resolve(message.result);
			}
			return;
		}

		if (message.method === 'textDocument/publishDiagnostics') {
			const published = message.params as PublishedDiagnostics;
			diagnosticWaiters.get(published.uri)?.resolve(published.diagnostics);
			return;
		}

		if (message.method === '@/tailwindCSS/documentReady') {
			const params = message.params as { uri: string };
			documentReadyWaiters.get(params.uri)?.resolve();
			return;
		}

		if (message.method === '@/tailwindCSS/projectReloaded') {
			projectReady.resolve();
			return;
		}

		if (message.method === '@/tailwindCSS/serverReady') {
			serverReady.resolve();
			return;
		}

		if (message.id === undefined) {
			return;
		}

		if (message.method === 'workspace/configuration') {
			const params = message.params as { items: Array<{ section?: string }> };
			respond(
				message.id,
				params.items.map((item) => settingForSection(item.section))
			);
			return;
		}

		if (message.method === 'workspace/workspaceFolders') {
			respond(message.id, [{ name: 'RideControl', uri: workspaceUri }]);
			return;
		}

		if (message.method === 'workspace/applyEdit') {
			respond(message.id, { applied: false });
			return;
		}

		respond(message.id, null);
	};

	server.stdout.on('data', (chunk: Buffer) => {
		output = Buffer.concat([output, chunk]);
		while (output.length > 0) {
			const headerEnd = output.indexOf('\r\n\r\n');
			if (headerEnd < 0) {
				break;
			}
			const header = output.subarray(0, headerEnd).toString('ascii');
			const contentLength = CONTENT_LENGTH_PATTERN.exec(header)?.[1];
			if (!contentLength) {
				throw new Error('Tailwind language server sent an invalid response header.');
			}
			const bodyStart = headerEnd + 4;
			const bodyEnd = bodyStart + Number(contentLength);
			if (output.length < bodyEnd) {
				break;
			}
			const body = output.subarray(bodyStart, bodyEnd).toString('utf8');
			output = output.subarray(bodyEnd);
			handleMessage(JSON.parse(body) as JsonRpcMessage);
		}
	});

	const request = (method: string, params?: unknown) => {
		const id = nextRequestId;
		nextRequestId += 1;
		const response = deferred<unknown>();
		pendingRequests.set(id, response);
		send({ id, method, params });
		return response.promise;
	};

	try {
		await withTimeout(
			request('initialize', {
				capabilities: {
					experimental: { tailwind: { projectDetails: true } },
					textDocument: {
						codeAction: { dynamicRegistration: true },
						completion: { dynamicRegistration: true },
						publishDiagnostics: { relatedInformation: true },
						synchronization: { didSave: true, dynamicRegistration: true },
					},
					workspace: {
						configuration: true,
						didChangeConfiguration: { dynamicRegistration: true },
						didChangeWatchedFiles: { dynamicRegistration: true },
						workspaceFolders: true,
					},
				},
				initializationOptions: { testMode: true },
				processId: process.pid,
				rootUri: workspaceUri,
				trace: 'off',
				workspaceFolders: [{ name: 'RideControl', uri: workspaceUri }],
			}),
			'Tailwind language server initialization'
		);
		send({ method: 'initialized', params: {} });
		await withTimeout(serverReady.promise, 'Tailwind language server readiness');

		const canaryUri = pathToFileURL(resolvePath('src/tailwind-diagnostic-canary.tsx')).href;
		const canaryDocumentReady = deferred<void>();
		const canaryWaiter = deferred<Diagnostic[]>();
		documentReadyWaiters.set(canaryUri, canaryDocumentReady);
		diagnosticWaiters.set(canaryUri, canaryWaiter);
		send({
			method: 'textDocument/didOpen',
			params: {
				textDocument: {
					languageId: 'typescriptreact',
					text: DIAGNOSTIC_CANARY,
					uri: canaryUri,
					version: 1,
				},
			},
		});
		await Promise.all([
			withTimeout(projectReady.promise, 'Tailwind project initialization'),
			withTimeout(canaryDocumentReady.promise, 'Tailwind canary document readiness'),
		]);
		send({
			method: 'textDocument/didChange',
			params: {
				contentChanges: [{ text: `${DIAGNOSTIC_CANARY}\n` }],
				textDocument: { uri: canaryUri, version: 2 },
			},
		});
		const canaryDiagnostics = await withTimeout(
			canaryWaiter.promise,
			'Tailwind conflict canary diagnostics'
		);
		if (!canaryDiagnostics.some((diagnostic) => diagnostic.code === 'cssConflict')) {
			throw new Error(
				'Tailwind CSS conflict diagnostics are unavailable; the check cannot be trusted.'
			);
		}
		diagnosticWaiters.delete(canaryUri);
		documentReadyWaiters.delete(canaryUri);
		send({
			method: 'textDocument/didClose',
			params: { textDocument: { uri: canaryUri } },
		});

		const files = [
			...(await sourceFiles(resolvePath('src'))),
			resolvePath('index.html'),
		].sort();
		const documents: SourceDocument[] = await Promise.all(
			files.map(async (file) => ({
				file,
				text: await readFile(file, 'utf8'),
				uri: pathToFileURL(file).href,
			}))
		);
		const documentsToCheck = documents.filter(containsTailwindSyntax);
		const documentWaiters = documentsToCheck.map(({ file, text, uri }) => {
			const diagnosticsReady = deferred<Diagnostic[]>();
			const documentReady = deferred<void>();
			diagnosticWaiters.set(uri, diagnosticsReady);
			documentReadyWaiters.set(uri, documentReady);
			send({
				method: 'textDocument/didOpen',
				params: {
					textDocument: {
						languageId: LANGUAGE_IDS.get(extname(file)) ?? 'plaintext',
						text,
						uri,
						version: 1,
					},
				},
			});
			return { diagnosticsReady, documentReady, file, text, uri };
		});
		await Promise.all(
			documentWaiters.map(({ documentReady, file }) =>
				withTimeout(
					documentReady.promise,
					`Tailwind document readiness for ${relative(workspace, file)}`
				)
			)
		);
		const reportedDiagnostics: Array<{
			diagnostics: Diagnostic[];
			file: string;
		}> = [];
		for (const { diagnosticsReady, file, text, uri } of documentWaiters) {
			send({
				method: 'textDocument/didChange',
				params: {
					contentChanges: [{ text: `${text}\n` }],
					textDocument: { uri, version: 2 },
				},
			});
			reportedDiagnostics.push({
				diagnostics: await withTimeout(
					diagnosticsReady.promise,
					`Tailwind diagnostics for ${relative(workspace, file)}`
				),
				file,
			});
		}

		const failures = [
			...reportedDiagnostics.flatMap(({ diagnostics: fileDiagnostics, file }) =>
				fileDiagnostics
					.filter(
						(diagnostic) =>
							diagnostic.severity === undefined || diagnostic.severity <= 2
					)
					.map((diagnostic) => ({ diagnostic, file }))
			),
			...(await scopedBorderColorConflicts(documentsToCheck, request)),
		].sort(
			(left, right) =>
				left.file.localeCompare(right.file) ||
				left.diagnostic.range.start.line - right.diagnostic.range.start.line ||
				left.diagnostic.range.start.character - right.diagnostic.range.start.character
		);

		if (failures.length > 0) {
			for (const { diagnostic, file } of failures) {
				const location = `${relative(workspace, file)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;
				const code = diagnostic.code === undefined ? '' : ` [${diagnostic.code}]`;
				console.error(
					`${location} ${diagnosticLevel(diagnostic.severity)}${code} ${diagnostic.message}`
				);
			}
			throw new Error(`Tailwind CSS reported ${failures.length} diagnostic(s).`);
		}

		console.log(`Tailwind CSS diagnostics passed for ${files.length} source files.`);
	} finally {
		try {
			await request('shutdown');
			send({ method: 'exit' });
		} catch {
			// Preserve the original failure when shutdown cannot complete.
		}
		server.kill();
		if (serverErrors.trim()) {
			console.error(serverErrors.trim());
		}
	}
}

await main();
