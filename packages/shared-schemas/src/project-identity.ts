function decodeUriComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveFileUri(value: string): string {
  try {
    const url = new URL(value);
    const pathname = decodeUriComponentSafely(url.pathname);

    if (/^\/[a-z]:\//i.test(pathname)) {
      return pathname.slice(1);
    }

    if (url.host && url.host !== "localhost") {
      return `//${url.host}${pathname}`;
    }

    return pathname;
  } catch {
    return value.replace(/^file:\/*/i, "/");
  }
}

function resolveVsCodeRemoteUri(value: string): string {
  try {
    const url = new URL(value);
    const authority = decodeUriComponentSafely(url.host);
    const pathname = decodeUriComponentSafely(url.pathname);

    if (authority.toLowerCase().startsWith("wsl+")) {
      return pathname;
    }

    return pathname || value;
  } catch {
    return value;
  }
}

function resolveWorkspaceLocator(value: string): string {
  if (/^file:\/\//i.test(value)) {
    return resolveFileUri(value);
  }

  if (/^vscode-remote:\/\//i.test(value)) {
    return resolveVsCodeRemoteUri(value);
  }

  return value;
}

function collapseSlashes(value: string): string {
  const uncPrefix = value.startsWith("//") ? "//" : "";
  const remainder = uncPrefix ? value.slice(2) : value;

  return `${uncPrefix}${remainder.replace(/\/{2,}/g, "/")}`;
}

function convertMountedWindowsPath(value: string): string {
  const mountedMatch = value.match(/^\/mnt\/([a-z])\/(.+)$/i);

  if (!mountedMatch) {
    return value;
  }

  const [, driveLetter, remainder] = mountedMatch;
  return `${driveLetter.toUpperCase()}:/${remainder}`;
}

function normalizeDriveLetter(value: string): string {
  return /^[a-z]:\//i.test(value)
    ? `${value[0]!.toUpperCase()}${value.slice(1)}`
    : value;
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createStableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function normalizeWorkspacePath(value: string): string {
  const normalizedInput = collapseSlashes(
    resolveWorkspaceLocator(value.trim())
      .replace(/^\\\\\?\\/, "")
      .replaceAll("\\", "/")
  );

  if (!normalizedInput) {
    return "";
  }

  const mountedWindowsPath = convertMountedWindowsPath(normalizedInput);
  const withoutDrivePrefix =
    /^\/[a-z]:\//i.test(mountedWindowsPath)
      ? mountedWindowsPath.slice(1)
      : mountedWindowsPath;
  const normalizedDrivePrefix = normalizeDriveLetter(withoutDrivePrefix);

  if (
    normalizedDrivePrefix === "/" ||
    /^[a-z]:\/$/i.test(normalizedDrivePrefix)
  ) {
    return normalizedDrivePrefix;
  }

  return normalizedDrivePrefix.replace(/\/+$/g, "");
}

export function createProjectGroupingKey(value: string): string {
  const normalized = normalizeWorkspacePath(value);

  if (!normalized) {
    return normalized;
  }

  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
}

export function getWorkspacePathSegments(value: string): string[] {
  return normalizeWorkspacePath(value)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function getWorkspaceBaseName(value: string): string {
  const segments = getWorkspacePathSegments(value);
  return segments[segments.length - 1] ?? "Workspace";
}

export function createProjectIdFromWorkspacePath(value: string): string {
  const baseName = createSlug(getWorkspaceBaseName(value)) || "workspace";
  return `project-${baseName}-${createStableHash(createProjectGroupingKey(value))}`;
}
