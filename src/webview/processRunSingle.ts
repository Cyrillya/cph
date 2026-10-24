import { Problem, RunResult } from '../types';
import { getLanguage } from '../utils';
import { getBinSaveLocation, compileFile } from '../compiler';
import { saveProblem } from '../parser';
import { runTestCase, deleteBinary, runCustomChecker } from '../executions';
import { isResultCorrect } from '../judge';
import { diffOutput } from '../utils/diffOutput';
import * as vscode from 'vscode';
import { getJudgeViewProvider } from '../extension';
import { getIgnoreSTDERRORPref } from '../preferences';
import telmetry from '../telmetry';
import * as fs from 'fs';
import path from 'path';
import localize from '../i18n';

/**
 * Custom checker paths are stored relative to the source file's folder;
 * resolve them to an absolute path for spawning the process.
 */
export const getAbsoluteCheckerPath = (problem: Problem): string => {
    const raw = (problem.customCheckerPath || '').trim();
    if (!raw || path.isAbsolute(raw)) {
        return raw;
    }
    return path.resolve(path.dirname(problem.srcPath), raw);
};

export const runSingleAndSave = async (
    problem: Problem,
    id: number,
    skipCompile = false,
    skipTelemetry = false,
): Promise<RunResult | undefined> => {
    if (!skipTelemetry) {
        globalThis.reporter.sendTelemetryEvent(telmetry.RUN_TESTCASE);
    }
    globalThis.logger.log('Run and save started', problem, id);
    const srcPath = problem.srcPath;
    const language = getLanguage(srcPath);
    const binPath = getBinSaveLocation(srcPath);
    const idx = problem.tests.findIndex((value) => value.id === id);
    const testCase = problem.tests[idx];

    const textEditor = await vscode.workspace.openTextDocument(srcPath);
    await vscode.window.showTextDocument(textEditor, vscode.ViewColumn.One);
    await textEditor.save();

    if (!testCase) {
        globalThis.logger.error('Invalid id', id, problem);
        return;
    }

    saveProblem(srcPath, problem);

    if (!skipCompile) {
        if (!(await compileFile(srcPath))) {
            globalThis.logger.error('Failed to compile', problem, id);
            return;
        }
    }

    const run = await runTestCase(language, binPath, testCase.input);

    if (!skipCompile) {
        deleteBinary(language, binPath);
    }

    const stderrorFailure = getIgnoreSTDERRORPref() ? false : run.stderr !== '';

    const didError =
        (run.code !== null && run.code !== 0) ||
        run.signal !== null ||
        stderrorFailure;

    let pass: boolean | null = null;
    let checkerRun: any = undefined;

    if (run.signal === 'SIGTERM' || run.signal === 'SIGKILL') {
        pass = false;
    } else if (didError) {
        pass = false;
    } else if (
        problem.customCheckerPath &&
        problem.customCheckerPath.trim() !== ''
    ) {
        const checkerPath = getAbsoluteCheckerPath(problem);
        if (fs.existsSync(checkerPath)) {
            getJudgeViewProvider().extensionToJudgeViewMessage({
                command: 'checking',
                id,
                problem,
            });
            checkerRun = await runCustomChecker(
                checkerPath,
                testCase.input,
                run.stdout,
            );
            pass = checkerRun.code === 0;
            if (
                checkerRun.signal === 'SIGTERM' ||
                checkerRun.signal === 'SIGKILL'
            ) {
                run.signal = checkerRun.signal; // Propagate signal to main run object so processRunAll can stop
            }
        } else {
            vscode.window.showErrorMessage(
                localize(
                    'cph.processRunSingle.invalidChecker',
                    "Custom checker script not found at '{0}'",
                    checkerPath,
                ),
            );
            pass = false;
        }
    } else {
        pass = isResultCorrect(testCase, run.stdout);
    }

    const result: RunResult = {
        ...run,
        pass,
        checkerRun,
        diff:
            didError ||
            (problem.customCheckerPath &&
                problem.customCheckerPath.trim() !== '') ||
            run.signal === 'SIGTERM' ||
            run.signal === 'SIGKILL'
                ? undefined
                : diffOutput(testCase.output, run.stdout),
        id,
    };

    globalThis.logger.log('Testcase judging complete. Result:', result);
    getJudgeViewProvider().extensionToJudgeViewMessage({
        command: 'run-single-result',
        result,
        problem,
    });
    return result;
};
