import { createRequire } from "node:module";
import path from "node:path";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, "packages", "protocol-mcp");
const distRoot = path.join(packageRoot, "dist");
const outputNodeModules = path.join(distRoot, "node_modules");
const requireFromPackage = createRequire(path.join(packageRoot, "package.json"));
const roots = [
  {
    name: "@modelcontextprotocol/sdk",
    specifier: "@modelcontextprotocol/sdk/server/index.js"
  },
  { name: "zod" }
];
const copied = new Set();

function assertInside(parent, candidate) {
  const relative = path.relative(parent, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${parent}: ${candidate}`);
  }
}

function packageOutputPath(packageName) {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    return path.join(outputNodeModules, scope, name);
  }

  return path.join(outputNodeModules, packageName);
}

async function readPackageJson(packageJsonPath) {
  return JSON.parse(await readFile(packageJsonPath, "utf8"));
}

async function findPackageRoot(packageName, startDir) {
  let current = startDir;

  while (true) {
    const packageJsonPath = path.join(current, "package.json");

    try {
      const packageJson = await readPackageJson(packageJsonPath);

      if (packageJson.name === packageName) {
        return current;
      }
    } catch {
      // Keep walking upward until we either find the package root or hit the filesystem root.
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(`Could not find package root for ${packageName}.`);
    }

    current = parent;
  }
}

async function copyPackage(
  packageName,
  fromPaths = [packageRoot],
  specifier = packageName
) {
  if (copied.has(packageName)) {
    return;
  }

  let packageEntryPath;

  try {
    packageEntryPath = requireFromPackage.resolve(specifier, {
      paths: fromPaths
    });
  } catch {
    packageEntryPath = requireFromPackage.resolve(`${packageName}/package.json`, {
      paths: fromPaths
    });
  }
  const sourceRoot = await findPackageRoot(packageName, path.dirname(packageEntryPath));
  const packageJsonPath = path.join(sourceRoot, "package.json");
  const destinationRoot = packageOutputPath(packageName);

  copied.add(packageName);
  assertInside(outputNodeModules, destinationRoot);
  await mkdir(path.dirname(destinationRoot), { recursive: true });
  await cp(sourceRoot, destinationRoot, {
    recursive: true,
    dereference: true,
    filter: (source) => path.basename(source) !== "node_modules"
  });

  const packageJson = await readPackageJson(packageJsonPath);
  const dependencyNames = Object.keys(packageJson.dependencies ?? {});
  const peerDependencies = packageJson.peerDependencies ?? {};
  const peerDependenciesMeta = packageJson.peerDependenciesMeta ?? {};
  const peerDependencyNames = Object.keys(peerDependencies).filter(
    (dependencyName) => peerDependenciesMeta[dependencyName]?.optional !== true
  );

  for (const dependencyName of [...dependencyNames, ...peerDependencyNames]) {
    await copyPackage(dependencyName, [sourceRoot, packageRoot]);
  }
}

await mkdir(distRoot, { recursive: true });
assertInside(distRoot, outputNodeModules);
await rm(outputNodeModules, { recursive: true, force: true });

for (const root of roots) {
  await copyPackage(root.name, [packageRoot], root.specifier ?? root.name);
}

await writeFile(
  path.join(outputNodeModules, ".submind-standalone.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      packages: [...copied].sort()
    },
    null,
    2
  )}\n`
);

console.log(
  `Prepared standalone MCP runtime with ${copied.size} packages at ${path.relative(
    repoRoot,
    outputNodeModules
  )}`
);
