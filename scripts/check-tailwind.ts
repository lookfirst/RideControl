import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIAGNOSTIC_TIMEOUT_MS = 30_000;
const CONTENT_LENGTH_PATTERN = /Content-Length: (\d+)/i;
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
	const diagnostics = new Map<string, Diagnostic[]>();
	const diagnosticWaiters = new Map<string, Deferred<Diagnostic[]>>();
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
			diagnostics.set(published.uri, published.diagnostics);
			diagnosticWaiters.get(published.uri)?.resolve(published.diagnostics);
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

		const files = [
			...(await sourceFiles(resolvePath('src'))),
			resolvePath('index.html'),
		].sort();
		await Promise.all(
			files.map(async (file) => {
				const uri = pathToFileURL(file).href;
				const waiter = deferred<Diagnostic[]>();
				diagnosticWaiters.set(uri, waiter);
				send({
					method: 'textDocument/didOpen',
					params: {
						textDocument: {
							languageId: LANGUAGE_IDS.get(extname(file)) ?? 'plaintext',
							text: await readFile(file, 'utf8'),
							uri,
							version: 1,
						},
					},
				});
				await withTimeout(
					waiter.promise,
					`Tailwind diagnostics for ${relative(workspace, file)}`
				);
			})
		);

		const failures = [...diagnostics.entries()]
			.flatMap(([uri, fileDiagnostics]) =>
				fileDiagnostics
					.filter(
						(diagnostic) =>
							diagnostic.severity === undefined || diagnostic.severity <= 2
					)
					.map((diagnostic) => ({ diagnostic, file: fileURLToPath(uri) }))
			)
			.sort(
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
