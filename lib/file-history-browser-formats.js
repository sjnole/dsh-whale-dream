const browserFiles = new Set([
  'htm', 'html', 'xhtml', 'svg', 'pdf', 'txt', 'md', 'csv', 'tsv', 'xls', 'xlsx', 'xlsm', 'ods',
  'doc', 'docx', 'odt', 'ppt', 'pptx', 'odp', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp',
  'mp3', 'wav', 'ogg', 'mp4', 'webm',
]);

export function canOpenFileInBrowser(path) {
  const extension = typeof path === 'string' && /\.([a-z\d]+)$/i.exec(path);
  return Boolean(extension && browserFiles.has(extension[1].toLowerCase()));
}
