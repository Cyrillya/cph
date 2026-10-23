/**
 * Binds an existing source file to an online judge problem by pasting its URL.
 *
 * This is the counterpart of importing a problem through Competitive Companion:
 * no new file is created, the metadata ( name, url, samples ... ) is simply
 * attached to the file currently being edited.
 */

import * as vscode from 'vscode';
import path from 'path';
import { Problem, TestCase } from './types';
import { getProblem, saveProblem } from './parser';
import { checkUnsupported, randomId } from './utils';
import { getJudgeViewProvider } from './extension';
import { fetchProblemMetadata, parseProblemUrl } from './siteFetch';
import localize from './i18n';

const SUPPORTED_SITES = 'Codeforces, Luogu, AtCoder';

const blankTest = (index: number): TestCase => ({
    id: randomId(index),
    input: '',
    output: '',
});

/**
 * Ask for a problem URL and attach it to `srcPath` ( the active editor when not
 * given ). Shows an error dialog for unsupported files and URLs.
 */
export const linkProblemToUrl = async (srcPath?: string) => {
    const target = srcPath ?? vscode.window.activeTextEditor?.document.fileName;

    if (target === undefined) {
        vscode.window.showErrorMessage(
            localize(
                'cph.problemLink.noEditor',
                'Open a source file before linking it to a problem.',
            ),
        );
        return;
    }
    if (checkUnsupported(target)) {
        return;
    }

    const existing = getProblem(target);
    if (existing !== null) {
        const replace = localize('cph.problemLink.replace', 'Replace');
        const answer = await vscode.window.showWarningMessage(
            localize(
                'cph.problemLink.overwritePrompt',
                'This file already has a problem associated with it. Replace it?',
            ),
            { modal: true },
            replace,
        );
        if (answer !== replace) {
            return;
        }
    }

    const invalidUrl = localize(
        'cph.problemLink.invalidUrl',
        'Only Codeforces, Luogu and AtCoder problem URLs are supported.',
    );

    const url = await vscode.window.showInputBox({
        prompt: localize(
            'cph.problemLink.prompt',
            'Paste the problem URL of this file ( {0} )',
            SUPPORTED_SITES,
        ),
        placeHolder: 'https://codeforces.com/problemset/problem/1/A',
        ignoreFocusOut: true,
        validateInput: (value) =>
            parseProblemUrl(value) === null ? invalidUrl : null,
    });

    if (url === undefined || url.trim() === '') {
        return;
    }

    const parsed = parseProblemUrl(url);
    if (parsed === null) {
        vscode.window.showErrorMessage(invalidUrl);
        return;
    }

    const normalizedUrl = url.trim();
    const fetched = await fetchProblemMetadata(normalizedUrl, parsed.site);

    const name =
        fetched.title === null || fetched.title === ''
            ? parsed.id
            : `${parsed.id} - ${fetched.title}`;

    const problem: Problem = {
        name,
        url: normalizedUrl,
        interactive: false,
        memoryLimit: fetched.memoryLimit ?? 1024,
        timeLimit: fetched.timeLimit ?? 3000,
        group: parsed.site,
        tests: fetched.tests.length > 0 ? fetched.tests : [blankTest(0)],
        srcPath: target,
        local: false,
    };

    saveProblem(target, problem);
    globalThis.logger.log('Linked problem', problem);

    getJudgeViewProvider().extensionToJudgeViewMessage({
        command: 'new-problem',
        problem,
    });

    if (fetched.tests.length === 0) {
        vscode.window.showWarningMessage(
            localize(
                'cph.problemLink.noTests',
                'Bound to {0}, but the sample testcases could not be downloaded. You can add them manually.',
                name,
            ),
        );
    } else {
        vscode.window.showInformationMessage(
            localize(
                'cph.problemLink.created',
                'Bound "{0}" to {1} and imported {2} sample testcases.',
                path.basename(target),
                name,
                String(fetched.tests.length),
            ),
        );
    }
};
