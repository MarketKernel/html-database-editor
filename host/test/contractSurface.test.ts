// The system works on contracts. Six readings of the sources hold it to that: an `-impl` package
// is imported in a binding package's serviceFactory.ts alone; across the workspace an `-impl` is a
// `dependencies` entry of a binding package alone (`devDependencies` are free: a test may drive an
// implementation directly); no implementation is bound by two binding packages; a contract package
// carries types only; an `-impl` package exports no class; and no class of an `-impl` implements an
// interface declared in that `-impl` — every part is in the contract, so the contract shows the whole
// skeleton. A new import or dependency anywhere else fails here, not in review.
// Three more hold the layout: a folder holds two entries at least; inside a contract's `models/` a
// subject folder (`models/order/`, `models/simpleTypes/order/`) is used by its own subject alone; and
// what one subject alone uses sits in that subject's folder, once the folder exists.
// Three keep errors and models apart in a contract: no model imports an error and no error or kind is
// declared under `models/`; an error's kind is declared in the error's own file; and what errors alone
// use sits in `errors/`.
//
// Install: copy to `<host>/test/contractSurface.test.ts` and ADJUST the two constants below. It runs
// compiled, from `<host>/dist/test/`, with `node --test`.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// ADJUST: the workspace root (the directory whose package.json lists "workspaces"), relative to the host.
const WORKSPACE_ROOT = "..";
// ADJUST: the packages that bind contracts to implementations, by package.json "name"; mirror ARCHITECTURE.md.
const BINDING_PACKAGES: readonly string[] = ["@db-manager/host"];
// ADJUST: workspace packages that carry runtime but are neither a contract nor an `-impl` (a generated
// wasm-bindgen package, a second app); listed in ARCHITECTURE.md.
const NON_CONTRACT_PACKAGES: readonly string[] = [];

const SERVICE_FACTORY = "serviceFactory.ts";
const SOURCE_DIR = "src";
const MANIFEST = "package.json";
/** How an implementation package is spelled in an import or a dependency key. */
const IMPL_SUFFIX = "-impl";
/** A contract-less package of plain functions: runtime is its point. */
const UTILS_SUFFIX = "-utils";
/** The dependency tables a build links; `devDependencies` are free. */
const LINKED_TABLES = ["dependencies", "peerDependencies", "optionalDependencies"] as const;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const SKIPPED_DIRS = new Set(["node_modules", "dist"]);
/** A folder holding one file is three entities where one does the job. */
const MIN_FOLDER_ENTRIES = 2;
/** The category of a contract's models; the folders under it are subjects. */
const MODELS_DIR = "models";
/** A category inside `models/`, never a subject: `models/simpleTypes/order/` belongs to subject `order`. */
const SIMPLE_TYPES_DIR = "simpleTypes";
/** The category of a contract's errors, beside `models/`. */
const ERRORS_DIR = "errors";
/** The facade re-exports everything; it is no use of what it exports. */
const FACADE = "index.ts";
/** An error type, or the kind vocabulary of one: `OrderError`, `OrderErrorKind`, `TaskFailure`, `TaskFailureKind`. */
const ERROR_NAME_PATTERN = /(?:Error|Failure)(?:Kind)?$/;
/** The suffix that turns an error's name into its kind's. */
const KIND_SUFFIX = "Kind";

/** This file runs from `<host>/dist/test`; the host is two levels up. */
const hostDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceDir = resolve(hostDir, WORKSPACE_ROOT);

test("only a serviceFactory.ts imports an implementation package", () => {
  const offenders = workspacePackages()
    .flatMap((pkg) => sourceFiles(join(pkg.dir, SOURCE_DIR)).filter((file) => !(isBinding(pkg) && basename(file) === SERVICE_FACTORY)))
    .filter((file) => importsAnImplPackage(readFileSync(file, "utf8")))
    .map((file) => relative(workspaceDir, file));
  assert.deepEqual(offenders, [], `an implementation package is imported outside a ${SERVICE_FACTORY}`);
});

test("only a binding package depends on an implementation package", () => {
  const offenders = workspacePackages()
    .filter((pkg) => !isBinding(pkg))
    .flatMap((pkg) => pkg.linkedDependencies.filter(isImplementationName).map((dependency) => `${pkg.name} -> ${dependency}`));
  assert.deepEqual(offenders, [], `an implementation package is a dependency outside ${BINDING_PACKAGES.join(", ")}`);
});

test("every implementation is bound by one package alone", () => {
  const binders = workspacePackages().filter(isBinding);
  const boundTwice = binders.flatMap((pkg, index) =>
    pkg.linkedDependencies
      .filter(isImplementationName)
      .flatMap((dependency) =>
        binders
          .slice(index + 1)
          .filter((other) => other.linkedDependencies.includes(dependency))
          .map((other) => `${dependency} by ${pkg.name} and ${other.name}`),
      ),
  );
  assert.deepEqual(boundTwice, [], "an implementation is bound twice");
});

test("a contract package carries types only", () => {
  const offenders = workspacePackages()
    .filter(isContract)
    .flatMap((pkg) => sourceFiles(join(pkg.dir, SOURCE_DIR)))
    .flatMap((file) => runtimeStatements(readFileSync(file, "utf8")).map((line) => `${relative(workspaceDir, file)}: ${line}`));
  assert.deepEqual(offenders, [], "a contract package carries runtime code; only `export type`, `interface` and `type` belong there");
});

test("an implementation package exports no class", () => {
  const offenders = workspacePackages()
    .filter((pkg) => isImplementationName(pkg.name))
    .flatMap((pkg) => sourceFiles(join(pkg.dir, SOURCE_DIR)))
    .flatMap((file) => exportedClasses(readFileSync(file, "utf8")).map((line) => `${relative(workspaceDir, file)}: ${line}`));
  assert.deepEqual(offenders, [], "an implementation class is exported; export its factory instead");
});

test("every interface an implementation class implements is declared in a contract", () => {
  const offenders = workspacePackages()
    .filter((pkg) => isImplementationName(pkg.name))
    .flatMap((pkg) => {
      const files = sourceFiles(join(pkg.dir, SOURCE_DIR));
      const declaredHere = new Set(files.flatMap((file) => declaredTypeNames(readFileSync(file, "utf8"))));
      return files.flatMap((file) =>
        implementedNames(readFileSync(file, "utf8"))
          .filter((name) => declaredHere.has(name))
          .map((name) => `${relative(workspaceDir, file)}: implements ${name}`),
      );
    });
  assert.deepEqual(offenders, [], "a part is declared in its -impl; move its interface to the contract package");
});

test("a folder holds two entries at least", () => {
  const offenders = workspacePackages()
    .flatMap((pkg) => sourceDirs(join(pkg.dir, SOURCE_DIR)))
    .filter((dir) => visibleEntries(dir).length < MIN_FOLDER_ENTRIES)
    .map((dir) => relative(workspaceDir, dir));
  assert.deepEqual(offenders, [], "a folder holds a single entry; keep the lone file flat beside its siblings");
});

test("a subject folder of models is used by its own subject alone", () => {
  const offenders = workspacePackages()
    .filter(isContract)
    .flatMap((pkg) => modelImports(join(pkg.dir, SOURCE_DIR, MODELS_DIR)))
    .filter((link) => link.targetSubject !== "" && !isWithinSubject(link.importerSubject, link.targetSubject))
    .map((link) => `${relative(workspaceDir, link.importer)} -> ${relative(workspaceDir, link.target)}`);
  assert.deepEqual(offenders, [], "a model of one subject is used by another; what two subjects share sits at the root of its category");
});

test("what one subject alone uses sits in that subject's folder", () => {
  const offenders = workspacePackages()
    .filter(isContract)
    .flatMap((pkg) => {
      const links = modelImports(join(pkg.dir, SOURCE_DIR, MODELS_DIR)).filter((link) => link.targetSubject === "");
      const targets = [...new Set(links.map((link) => link.target))];
      return targets.flatMap((target) => {
        const importerSubjects = [...new Set(links.filter((link) => link.target === target).map((link) => link.importerSubject))];
        const soleSubject = importerSubjects.length === 1 ? (importerSubjects[0] ?? "") : "";
        return soleSubject !== "" && existsSync(join(dirname(target), soleSubject))
          ? [`${relative(workspaceDir, target)}: used by ${soleSubject} alone`]
          : [];
      });
    });
  assert.deepEqual(offenders, [], "a model or simple type used by one subject alone sits outside that subject's folder");
});

test("a contract's models neither import an error nor declare one", () => {
  const offenders = workspacePackages()
    .filter(isContract)
    .flatMap((pkg) => {
      const modelsDir = join(pkg.dir, SOURCE_DIR, MODELS_DIR);
      const errorsDir = join(pkg.dir, SOURCE_DIR, ERRORS_DIR);
      return sourceFiles(modelsDir).flatMap((file) => [
        ...relativeImportTargets(file)
          .filter((target) => isInside(errorsDir, target))
          .map((target) => `${relative(workspaceDir, file)} -> ${relative(workspaceDir, target)}`),
        ...declaredTypeNames(readFileSync(file, "utf8"))
          .filter((name) => ERROR_NAME_PATTERN.test(name))
          .map((name) => `${relative(workspaceDir, file)}: declares ${name}`),
      ]);
    });
  assert.deepEqual(offenders, [], "models and errors cross; an error, its kind and what it alone uses live in errors/");
});

test("an error's kind is declared in the error's own file", () => {
  const offenders = workspacePackages()
    .filter(isContract)
    .flatMap((pkg) => {
      const declarations = sourceFiles(join(pkg.dir, SOURCE_DIR)).flatMap((file) =>
        declaredTypeNames(readFileSync(file, "utf8")).map((name) => ({ file, name })),
      );
      return declarations
        .filter(({ name }) => name.endsWith(KIND_SUFFIX) && ERROR_NAME_PATTERN.test(name))
        .filter(({ file, name }) => !declarations.some((other) => other.file === file && other.name === name.slice(0, -KIND_SUFFIX.length)))
        .map(({ file, name }) => `${relative(workspaceDir, file)}: ${name} apart from ${name.slice(0, -KIND_SUFFIX.length)}`);
    });
  assert.deepEqual(offenders, [], "an error's kind is declared apart from the error; declare both in the error's file");
});

test("what a contract's errors alone use sits in errors/", () => {
  const offenders = workspacePackages()
    .filter(isContract)
    .flatMap((pkg) => {
      const sourceDir = join(pkg.dir, SOURCE_DIR);
      const errorsDir = join(sourceDir, ERRORS_DIR);
      const links = sourceFiles(sourceDir)
        .filter((importer) => basename(importer) !== FACADE)
        .flatMap((importer) => relativeImportTargets(importer).map((target) => ({ importer, target })));
      return sourceFiles(join(sourceDir, MODELS_DIR)).filter((model) => {
        const importers = links.filter((link) => link.target === model).map((link) => link.importer);
        return importers.length > 0 && importers.every((importer) => isInside(errorsDir, importer));
      });
    })
    .map((model) => relative(workspaceDir, model));
  assert.deepEqual(offenders, [], "a model is used by errors alone; it describes a refusal and moves to errors/");
});

interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  /** The keys of every linked dependency table. */
  readonly linkedDependencies: readonly string[];
}

const isBinding = (pkg: WorkspacePackage): boolean => BINDING_PACKAGES.includes(pkg.name);

const isImplementationName = (name: string): boolean => name.endsWith(IMPL_SUFFIX);

const isContract = (pkg: WorkspacePackage): boolean =>
  !isBinding(pkg) && !isImplementationName(pkg.name) && !pkg.name.endsWith(UTILS_SUFFIX) && !NON_CONTRACT_PACKAGES.includes(pkg.name);

/** Whether `source` imports or re-exports a module whose specifier names an `-impl`, statically or dynamically. */
const importsAnImplPackage = (source: string): boolean =>
  /\bfrom\s+["'][^"']*-impl(?:[/"'])/.test(source) || /\b(?:import|require)\s*\(\s*["'][^"']*-impl(?:[/"'])/.test(source);

/** The statements of a contract file that would emit JavaScript. */
const runtimeStatements = (source: string): string[] =>
  withoutComments(source)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => isRuntimeImport(line) || isRuntimeExport(line) || /^(?:const|let|var|function|class|enum|abstract\s+class|async\s+function)\s/.test(line));

const isRuntimeImport = (line: string): boolean => /^import\b/.test(line) && !/^import\s+type\b/.test(line);

const isRuntimeExport = (line: string): boolean =>
  /^export\b/.test(line) && !/^export\s+(?:type|interface|declare\s+type|declare\s+interface)\b/.test(line);

const exportedClasses = (source: string): string[] =>
  withoutComments(source)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^export\s+(?:default\s+)?(?:abstract\s+)?class\b/.test(line));

/** The names a file declares with `interface` or `type`, exported or not. */
const declaredTypeNames = (source: string): string[] =>
  [...withoutComments(source).matchAll(/^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+(\w+)/gm)].map((match) => match[1] ?? "");

/** The names in every `implements` clause of the file, type arguments dropped. */
const implementedNames = (source: string): string[] =>
  [...withoutComments(source).matchAll(/\bclass\s+\w+[^{]*?\bimplements\s+([^{]+)\{/g)].flatMap((match) =>
    withoutTypeArguments(match[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );

const withoutTypeArguments = (clause: string): string => {
  const stripped = clause.replace(/<[^<>]*>/g, "");
  return stripped === clause ? clause : withoutTypeArguments(stripped);
};

const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every package the root package.json lists in "workspaces": `dir` entries and `dir/*` globs. */
const workspacePackages = (): WorkspacePackage[] => {
  return workspaceEntries(readManifest(workspaceDir))
    .flatMap((entry) => (entry.endsWith("/*") ? childDirs(join(workspaceDir, entry.slice(0, -2))) : [join(workspaceDir, entry)]))
    .filter((dir) => existsSync(join(dir, MANIFEST)))
    .map((dir) => {
      const manifest = readManifest(dir);
      return {
        name: manifest.name ?? relative(workspaceDir, dir),
        dir,
        linkedDependencies: LINKED_TABLES.flatMap((table) => Object.keys(manifest[table] ?? {})),
      };
    });
};

interface Manifest {
  readonly name?: string;
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] };
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

/** "workspaces" as npm and yarn spell it: a list, or an object holding the list under "packages". */
const workspaceEntries = (root: Manifest): readonly string[] => {
  const workspaces = root.workspaces;
  if (workspaces === undefined) return [];
  return isEntryList(workspaces) ? workspaces : (workspaces.packages ?? []);
};

const isEntryList = (workspaces: NonNullable<Manifest["workspaces"]>): workspaces is readonly string[] => Array.isArray(workspaces);

const readManifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, MANIFEST), "utf8")) as Manifest;

const childDirs = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)).filter((path) => statSync(path).isDirectory()) : [];

/** One relative import between two files of a contract's `models/`. */
interface ModelImport {
  readonly importer: string;
  readonly importerSubject: string;
  readonly target: string;
  readonly targetSubject: string;
}

/** Every import from a file of `modelsDir` to another file of it. */
const modelImports = (modelsDir: string): ModelImport[] =>
  sourceFiles(modelsDir).flatMap((importer) =>
    relativeImportTargets(importer)
      .filter((target) => isInside(modelsDir, target))
      .map((target) => ({
        importer,
        importerSubject: subjectOf(modelsDir, importer),
        target,
        targetSubject: subjectOf(modelsDir, target),
      })),
  );

/** The subject folders a file of `models/` sits in, the simple-types category dropped; "" at the root. */
const subjectOf = (modelsDir: string, file: string): string =>
  relative(modelsDir, dirname(file))
    .split(sep)
    .filter((segment) => segment !== "" && segment !== SIMPLE_TYPES_DIR)
    .join("/");

/** A nested subject may use what its enclosing subject declares. */
const isWithinSubject = (importerSubject: string, targetSubject: string): boolean =>
  importerSubject === targetSubject || importerSubject.startsWith(`${targetSubject}/`);

/** The source files a file imports by a relative specifier, `.js` read as the `.ts` it is compiled from. */
const relativeImportTargets = (file: string): string[] =>
  [...withoutComments(readFileSync(file, "utf8")).matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g)].map((match) =>
    resolve(dirname(file), (match[1] ?? "").replace(/\.js$/, ".ts")),
  );

const isInside = (dir: string, path: string): boolean => !relative(dir, path).startsWith("..");

/** Every folder below `dir`, `dir` itself excluded. */
const sourceDirs = (dir: string): string[] =>
  childDirs(dir)
    .filter((path) => !SKIPPED_DIRS.has(basename(path)))
    .flatMap((path) => [path, ...sourceDirs(path)]);

/** What a folder holds, hidden entries (`.DS_Store`) left out. */
const visibleEntries = (dir: string): string[] => readdirSync(dir).filter((name) => !name.startsWith("."));

const sourceFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension)) && !name.endsWith(".d.ts") ? [path] : [];
  });
};
