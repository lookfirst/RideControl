import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

interface GitHubPullRequest {
	html_url?: unknown;
	merged_at?: unknown;
	number?: unknown;
	title?: unknown;
}

const buildTimestampUtc = process.env.VITE_BUILD_TIMESTAMP ?? new Date().toISOString();
const buildPrUrl =
	process.env.VITE_BUILD_PR_URL ??
	'https://github.com/RideControlOrg/RideControl/pulls?q=is%3Apr+is%3Aclosed';

function validPullRequest(pullRequest: GitHubPullRequest) {
	return (
		typeof pullRequest.title === 'string' &&
		typeof pullRequest.html_url === 'string' &&
		typeof pullRequest.merged_at === 'string' &&
		typeof pullRequest.number === 'number'
	);
}

async function cloudflareRecentPullRequests() {
	if (!(process.env.WORKERS_CI === '1' && process.env.WORKERS_CI_BRANCH === 'main')) {
		return '[]';
	}
	try {
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		};
		if (process.env.GITHUB_TOKEN) {
			headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
		}
		const response = await fetch(
			'https://api.github.com/repos/RideControlOrg/RideControl/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100',
			{ headers, signal: AbortSignal.timeout(5000) }
		);
		if (!response.ok) {
			throw new Error(`GitHub returned HTTP ${response.status}`);
		}
		const payload: unknown = await response.json();
		if (!Array.isArray(payload)) {
			throw new Error('GitHub returned an unexpected pull request response');
		}
		const pullRequests = (payload as GitHubPullRequest[])
			.filter(validPullRequest)
			.sort((left, right) => {
				const rightTime = new Date(right.merged_at as string).getTime();
				const leftTime = new Date(left.merged_at as string).getTime();
				return rightTime - leftTime;
			})
			.slice(0, 10)
			.map((pullRequest) => ({
				mergedAt: pullRequest.merged_at,
				number: pullRequest.number,
				title: pullRequest.title,
				url: pullRequest.html_url,
			}));
		return JSON.stringify(pullRequests);
	} catch (error) {
		console.warn('Could not include recent pull requests in this production build.', error);
		return '[]';
	}
}

export default defineConfig(async () => {
	const recentPullRequests =
		process.env.VITE_BUILD_RECENT_PRS ?? (await cloudflareRecentPullRequests());
	return {
		build: {
			chunkSizeWarningLimit: 700,
		},
		define: {
			'import.meta.env.RIDE_CONTROL_BUILD_PR_URL': JSON.stringify(buildPrUrl),
			'import.meta.env.RIDE_CONTROL_BUILD_RECENT_PRS': JSON.stringify(recentPullRequests),
			'import.meta.env.RIDE_CONTROL_BUILD_TIMESTAMP_UTC': JSON.stringify(buildTimestampUtc),
		},
		plugins: [react(), tailwindcss(), cloudflare()],
	};
});
