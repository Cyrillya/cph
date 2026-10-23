import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as vscode from 'vscode';
import { Problem } from './types';
import { getSaveLocationPref } from './preferences';

/** Name of the folder used when no custom save location is configured. */
export const CPH_FOLDER = '.cph';

/** Creates `dir` (and parents) if it does not exist yet. */
export const ensureDir = (dir: string): void => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

/**
 * Expands `${workspaceFolder}` and `${workspaceFolder:name}` inside a user
 * supplied save location.
 *
 * @param raw the raw preference value
 * @param srcPath location of the source code, used to pick the default folder
 */
const expandWorkspaceFolder = (raw: string, srcPath: string): string => {
    if (raw.indexOf('${') === -1) {
        return raw;
    }

    const named: Record<string, string> = {};
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        named[folder.name] = folder.uri.fsPath;
    }

    let expanded = raw.replace(
        /\$\{workspaceFolder:([^}]+)\}/g,
        (_match, name: string) => named[name] ?? '.',
    );

    const defaultFolder =
        vscode.workspace.getWorkspaceFolder(vscode.Uri.file(srcPath)) ??
        vscode.workspace.workspaceFolders?.[0];

    // Falling back to '.' keeps things relative to the source file when the
    // workspace cannot be determined.
    expanded = expanded.replace(
        /\$\{workspaceFolder\}/g,
        defaultFolder?.uri.fsPath ?? '.',
    );

    return expanded.trim();
};

/**
 * Resolve the absolute folder that stores everything cph generates for a
 * source file: the problem metadata (`*.prob`) and compiled binaries.
 *
 * - Empty preference: a `.cph` folder next to the source file.
 * - Relative path: resolved against the directory of the source file.
 * - Absolute path / `${workspaceFolder}`: used as is.
 *
 * This function never touches the filesystem. Use {@link ensureMetadataFolder}
 * before writing anything.
 *
 * @param srcPath location of the source code
 */
export const resolveMetadataFolder = (srcPath: string): string => {
    const pref = getSaveLocationPref();
    const srcFolder = path.dirname(srcPath);

    if (pref === '') {
        return path.join(srcFolder, CPH_FOLDER);
    }

    const expanded = expandWorkspaceFolder(pref, srcPath);
    return path.isAbsolute(expanded)
        ? path.normalize(expanded)
        : path.resolve(srcFolder, expanded);
};

/**
 * Same as {@link resolveMetadataFolder} but creates the folder (recursively) if
 * it is missing.
 */
export const ensureMetadataFolder = (srcPath: string): string => {
    const folder = resolveMetadataFolder(srcPath);
    try {
        ensureDir(folder);
    } catch (err) {
        globalThis.logger?.error?.(
            'Could not create cph metadata folder',
            folder,
            err,
        );
    }
    return folder;
};

/**
 * A machine independent identifier for the source file, used to keep problem
 * files of same-named sources in different folders apart when a custom save
 * location is used.
 *
 * When the source lives inside a workspace, its workspace relative path is
 * used so that the generated file name stays identical after the code is moved
 * to another machine.
 */
const getSourceKey = (srcPath: string): string => {
    if (getSaveLocationPref() === '') {
        return '';
    }
    try {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
            vscode.Uri.file(srcPath),
        );
        if (workspaceFolder !== undefined) {
            const relative = path.relative(workspaceFolder.uri.fsPath, srcPath);
            if (relative !== '' && !relative.startsWith('..')) {
                return relative.replace(/[\\/:]/g, '_');
            }
        }
    } catch (err) {
        // Ignore and fall back to a hash.
    }
    return crypto.createHash('md5').update(srcPath).digest('hex').substr(0, 8);
};

/**
 * Get the location (file path) to save the generated problem file in. The
 * extension is `.prob`. All generated files live inside the resolved metadata
 * folder, see {@link resolveMetadataFolder}.
 *
 * @param srcPath location of the source code
 */
export const getProbSaveLocation = (srcPath: string): string => {
    const folder = resolveMetadataFolder(srcPath);
    const srcFileName = path.basename(srcPath);
    const key = getSourceKey(srcPath);
    const baseProbName =
        key === '' ? `.${srcFileName}.prob` : `.${srcFileName}_${key}.prob`;
    return path.join(folder, baseProbName);
};

/**
 * The location older versions of cph used for problem files. Kept around so
 * existing problem files are picked up (and migrated) instead of being lost.
 *
 * @param srcPath location of the source code
 */
export const getLegacyProbSaveLocation = (srcPath: string): string => {
    const savePreference = getSaveLocationPref();
    const srcFileName = path.basename(srcPath);
    const srcFolder = path.dirname(srcPath);
    const hash = crypto.createHash('md5').update(srcPath).digest('hex');
    const baseProbName = `.${srcFileName}_${hash}.prob`;
    const cphFolder = path.join(srcFolder, CPH_FOLDER);
    if (savePreference && savePreference !== '') {
        return path.join(savePreference, baseProbName);
    }
    return path.join(cphFolder, baseProbName);
};

/** Does any (new or legacy) problem file exist for this source? */
export const problemFileExists = (srcPath: string): boolean => {
    if (fs.existsSync(getProbSaveLocation(srcPath))) {
        return true;
    }
    const legacy = getLegacyProbSaveLocation(srcPath);
    return legacy !== getProbSaveLocation(srcPath) && fs.existsSync(legacy);
};

/**
 * Turn the paths inside a problem into paths relative to its own problem file
 * so that the metadata stays valid when the source is moved to another machine
 * or another filesystem.
 */
const relativizeProblem = (problem: Problem, probPath: string): Problem => {
    const baseDir = path.dirname(probPath);
    const relativize = (target: string): string => {
        if (!target || !path.isAbsolute(target)) {
            return target;
        }
        const relative = path.relative(baseDir, target);
        // `path.relative` falls back to an absolute path across drives.
        if (path.isAbsolute(relative)) {
            return target;
        }
        return relative.split(path.sep).join('/');
    };

    const serialized: Problem = {
        ...problem,
        srcPath: relativize(problem.srcPath),
    };

    if (serialized.customCheckerPath) {
        serialized.customCheckerPath = relativize(serialized.customCheckerPath);
    }

    return serialized;
};

/** Inverse of {@link relativizeProblem}. */
const absolutizeProblem = (problem: Problem, probPath: string): Problem => {
    const baseDir = path.dirname(probPath);
    const absolutize = (target: string): string =>
        !target || path.isAbsolute(target)
            ? target
            : path.resolve(baseDir, target);

    const resolved: Problem = {
        ...problem,
        srcPath: absolutize(problem.srcPath),
    };

    if (resolved.customCheckerPath) {
        resolved.customCheckerPath = absolutize(resolved.customCheckerPath);
    }

    return resolved;
};

/** Read and resolve a problem file. Returns `null` when unreadable. */
const readProblemFile = (probPath: string): Problem | null => {
    try {
        const problem: Problem = JSON.parse(
            fs.readFileSync(probPath).toString(),
        );
        return absolutizeProblem(problem, probPath);
    } catch (err) {
        globalThis.logger?.error?.('Error reading problem file', probPath, err);
        return null;
    }
};

/** Move a problem file created by an older version to its new location. */
const migrateLegacyProblemFile = (legacyPath: string, probPath: string) => {
    try {
        ensureDir(path.dirname(probPath));
        fs.renameSync(legacyPath, probPath);
        globalThis.logger?.log(
            'Migrated legacy problem file',
            legacyPath,
            probPath,
        );
    } catch (err) {
        globalThis.logger?.error?.(
            'Could not migrate legacy problem file',
            legacyPath,
            err,
        );
    }
};

/** Get the problem for a source, `null` if does not exist on the filesystem. */
export const getProblem = (srcPath: string): Problem | null => {
    const probPath = getProbSaveLocation(srcPath);
    if (fs.existsSync(probPath)) {
        return readProblemFile(probPath);
    }

    const legacyPath = getLegacyProbSaveLocation(srcPath);
    if (legacyPath !== probPath && fs.existsSync(legacyPath)) {
        const problem = readProblemFile(legacyPath);
        if (problem !== null) {
            migrateLegacyProblemFile(legacyPath, probPath);
        }
        return problem;
    }

    return null;
};

/** Save the problem (metadata) */
export const saveProblem = (srcPath: string, problem: Problem) => {
    ensureMetadataFolder(srcPath);
    const probPath = getProbSaveLocation(srcPath);

    try {
        fs.writeFileSync(
            probPath,
            JSON.stringify(relativizeProblem(problem, probPath)),
        );
    } catch (err) {
        throw new Error(err as string);
    }

    // Drop the file written by an older version, if any.
    const legacyPath = getLegacyProbSaveLocation(srcPath);
    if (legacyPath !== probPath && fs.existsSync(legacyPath)) {
        try {
            fs.unlinkSync(legacyPath);
        } catch (err) {
            globalThis.logger?.error?.(
                'Could not delete legacy problem file',
                legacyPath,
                err,
            );
        }
    }
};
