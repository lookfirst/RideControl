export function downloadBrowserFile(contents: BlobPart, filename: string, mimeType: string): void {
	const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
	const anchor = document.createElement('a');
	anchor.download = filename;
	anchor.href = url;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
