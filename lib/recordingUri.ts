const DOCUMENT_RECORDING_PREFIX = 'lampada-document:';
const IOS_APP_DOCUMENTS_PATTERN =
  /\/Containers\/Data\/Application\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/Documents\//i;

const withoutTrailingSlashes = (uri: string) => uri.replace(/\/+$/, '');

function isSafeRelativeUriPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || path.includes('?') || path.includes('#')) {
    return false;
  }

  return path.split('/').every((segment) => {
    if (!segment || segment === '.' || segment === '..') return false;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== '.' && decoded !== '..' && !decoded.includes('/') && !decoded.includes('\\');
    } catch {
      return false;
    }
  });
}

function relativeDocumentPath(uri: string, documentUri: string): string | null {
  if (uri.startsWith(DOCUMENT_RECORDING_PREFIX)) {
    const relative = uri.slice(DOCUMENT_RECORDING_PREFIX.length);
    return isSafeRelativeUriPath(relative) ? relative : null;
  }

  const documentBase = withoutTrailingSlashes(documentUri);
  const currentPrefix = `${documentBase}/`;
  if (uri.startsWith(currentPrefix)) {
    const relative = uri.slice(currentPrefix.length);
    return isSafeRelativeUriPath(relative) ? relative : null;
  }

  // On iOS an install-over can assign a new app-container UUID while keeping
  // the Documents contents. SQLite may contain either file:// or plain POSIX
  // paths, so accept both, but only for the precise app-container structure.
  if (uri.startsWith('file://') || uri.startsWith('/')) {
    const appDocuments = IOS_APP_DOCUMENTS_PATTERN.exec(uri);
    if (appDocuments) {
      const relative = uri.slice(appDocuments.index + appDocuments[0].length);
      return isSafeRelativeUriPath(relative) ? relative : null;
    }
  }

  return null;
}

/** Convert a Documents recording URI to the container-independent DB format. */
export function toStoredRecordingUri(uri: string, documentUri: string): string {
  const relative = relativeDocumentPath(uri, documentUri);
  return relative === null ? uri : `${DOCUMENT_RECORDING_PREFIX}${relative}`;
}

/** Resolve both the durable format and legacy iOS absolute URIs for playback/deletion. */
export function resolveRecordingUri(uri: string, documentUri: string): string {
  const relative = relativeDocumentPath(uri, documentUri);
  if (relative === null) return uri;
  return `${withoutTrailingSlashes(documentUri)}/${relative}`;
}
