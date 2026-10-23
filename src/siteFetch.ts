/**
 * Best effort helpers to turn a supported online judge URL into a cph problem.
 *
 * Supported sites: Codeforces, Luogu and AtCoder ( the same three Competitve
 * Companion exports ). Everything here is tolerant by design: network access,
 * anti bot protection or markup changes may make scraping fail, in which case
 * the caller still gets a usable ( empty ) problem.
 */

import { TestCase } from './types';
import { getProblemName } from './submit';
import { isCodeforcesUrl, isLuoguUrl, isAtCoderUrl } from './utils';

export type ProblemSite = 'codeforces' | 'luogu' | 'atcoder';

export type FetchedProblem = {
    title: string | null;
    tests: TestCase[];
    /** Time limit in milliseconds, `null` when unknown. */
    timeLimit: number | null;
    /** Memory limit in megabytes, `null` when unknown. */
    memoryLimit: number | null;
};

const REQUEST_TIMEOUT_MS = 15000;
const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ html --- */

/** Decode the entities that online judges use inside samples. */
const decodeEntities = (input: string): string =>
    input
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');

/**
 * Convert the inner html of a `<pre>` block into plain text. Line breaks are
 * preserved, other markup is dropped, entities are decoded.
 */
export const htmlPreToText = (raw: string): string => {
    const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n');
    const withoutTags = withBreaks.replace(/<[^>]*>/g, '');
    const decoded = decodeEntities(withoutTags).replace(/\r\n/g, '\n');
    return decoded.replace(/\n+$/, '');
};

/** All captures of a global regex. `matchAll` needs a newer lib than es2017. */
const matchAll = (source: string, regex: RegExp): string[][] => {
    const results: string[][] = [];
    const pattern = new RegExp(
        regex.source,
        regex.flags.includes('g') ? regex.flags : regex.flags + 'g',
    );
    let match = pattern.exec(source);
    while (match !== null) {
        results.push(match.slice());
        if (match[0] === '') {
            pattern.lastIndex += 1;
        }
        match = pattern.exec(source);
    }
    return results;
};

const firstMatch = (source: string, regex: RegExp): string | null => {
    const match = regex.exec(source);
    return match === null ? null : match[1];
};

/* ---------------------------------------------------------------- network -- */

const requestOptions = (): RequestInit => ({
    redirect: 'manual',
    headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    },
});

const COOKIE_ATTRIBUTES = [
    'expires',
    'max-age',
    'path',
    'domain',
    'secure',
    'httponly',
    'samesite',
    'priority',
];

/**
 * Extract cookies out of a ( possibly concatenated ) `Set-Cookie` header value.
 * Only the cookie pairs themselves are kept, not their attributes.
 */
const parseSetCookie = (raw: string | null): Record<string, string> => {
    const cookies: Record<string, string> = {};
    if (!raw) {
        return cookies;
    }
    const pattern = /([A-Za-z_][\w.-]*)=([^;,]*)/g;
    let match = pattern.exec(raw);
    while (match !== null) {
        const [, name, value] = match;
        if (!COOKIE_ATTRIBUTES.includes(name.toLowerCase())) {
            cookies[name] = value.trim();
        }
        match = pattern.exec(raw);
    }
    return cookies;
};

/**
 * Download `url` as text, following one anti bot redirect while keeping cookies
 * ( Luogu hands out a `C3VK` cookie and redirects to the very same URL ).
 */
const fetchText = async (
    url: string,
    extraHeaders: Record<string, string> = {},
): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const jar: Record<string, string> = {};

    try {
        let target = url;

        for (let hop = 0; hop < 3; hop++) {
            const cookie = Object.entries(jar)
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');

            const headers: Record<string, string> = {
                ...(requestOptions().headers as Record<string, string>),
                ...extraHeaders,
            };
            if (cookie !== '') {
                headers['Cookie'] = cookie;
            }

            const response = await fetch(target, {
                ...requestOptions(),
                headers,
                signal: controller.signal,
            });

            Object.assign(
                jar,
                parseSetCookie(response.headers.get('set-cookie')),
            );

            const location = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && location) {
                target = new URL(location, target).toString();
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.text();
        }

        throw new Error('Too many redirects');
    } finally {
        clearTimeout(timeout);
    }
};

/* ------------------------------------------------------------ url parsing -- */

export type ParsedProblemUrl = {
    site: ProblemSite;
    /** Short id such as `144C`, `P1000` or `abc311_a`. */
    id: string;
};

/**
 * Parse a user pasted URL into a supported site plus its short problem id.
 * Returns `null` when the URL is not a supported online judge problem link.
 */
export const parseProblemUrl = (raw: string): ParsedProblemUrl | null => {
    if (!raw) {
        return null;
    }

    const trimmed = raw.trim();
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch (err) {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
    }

    if (isCodeforcesUrl(url)) {
        const name = getProblemName(url.toString());
        return name === '' ? null : { site: 'codeforces', id: name };
    }

    if (isLuoguUrl(url)) {
        // Problem ids look like P1000 / U123456 / CF1980A; pages such as
        // /problem/list are not problems.
        const id = firstMatch(
            url.pathname,
            /\/problem\/([A-Za-z][A-Za-z0-9_]*\d[A-Za-z0-9_]*)/i,
        );
        return id === null ? null : { site: 'luogu', id };
    }

    if (isAtCoderUrl(url)) {
        const id = firstMatch(
            url.pathname,
            /\/contests\/[\w-]+\/tasks\/([\w-]+)/i,
        );
        return id === null ? null : { site: 'atcoder', id };
    }

    return null;
};

/* ------------------------------------------------------------- scraping --- */

const buildTests = (inputs: string[], outputs: string[]): TestCase[] => {
    const count = Math.min(inputs.length, outputs.length);
    const tests: TestCase[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    for (let index = 0; index < count; index++) {
        // AtCoder serves the statement in several languages at once, which
        // yields the very same sample more than once.
        const signature = `${inputs[index]}\u0000${outputs[index]}`;
        if (seen.has(signature)) {
            continue;
        }
        seen.add(signature);
        tests.push({
            input: inputs[index],
            output: outputs[index],
            id: now + index,
        });
    }
    return tests;
};

/** "1 second" -> 1000, "0.5 seconds" -> 500 */
const parseSeconds = (value: string | null): number | null => {
    if (value === null) {
        return null;
    }
    const match = /([\d.]+)/.exec(value);
    if (match === null) {
        return null;
    }
    return Math.round(parseFloat(match[1]) * 1000);
};

/** "64 megabytes" -> 64, "131072 kilobytes" -> 128 */
const parseMegabytes = (value: string | null): number | null => {
    if (value === null) {
        return null;
    }
    const match = /([\d.]+)\s*([a-zA-Z]*)/.exec(value);
    if (match === null) {
        return null;
    }
    const amount = parseFloat(match[1]);
    if (isNaN(amount)) {
        return null;
    }
    const unit = match[2].toLowerCase();
    if (unit.startsWith('g')) {
        return Math.round(amount * 1024);
    }
    if (unit.startsWith('k')) {
        return Math.round(amount / 1024);
    }
    return Math.round(amount);
};

const parseCodeforces = (html: string): FetchedProblem => {
    const inputs = matchAll(
        html,
        /<div class="input">\s*<div class="title">[^<]*<\/div>\s*<pre>([\s\S]*?)<\/pre>/,
    ).map((match) => htmlPreToText(match[1]));

    const outputs = matchAll(
        html,
        /<div class="output">\s*<div class="title">[^<]*<\/div>\s*<pre>([\s\S]*?)<\/pre>/,
    ).map((match) => htmlPreToText(match[1]));

    const title = firstMatch(
        html,
        /<div class="problem-statement">[\s\S]*?<div class="header">\s*<div class="title">([^<]*)<\/div>/,
    );
    const timeLimit = parseSeconds(
        firstMatch(html, /time limit per test<\/div>\s*([^<]*)</),
    );
    const memoryLimit = parseMegabytes(
        firstMatch(html, /memory limit per test<\/div>\s*([^<]*)</),
    );

    return {
        title: title === null ? null : title.trim(),
        tests: buildTests(inputs, outputs),
        timeLimit,
        memoryLimit,
    };
};

const parseAtCoder = (html: string): FetchedProblem => {
    const inputs = matchAll(
        html,
        /<h3>\s*(?:Sample Input|入力例)\s*[\d\s]*<\/h3>\s*<pre>([\s\S]*?)<\/pre>/,
    ).map((match) => htmlPreToText(match[1]));

    const outputs = matchAll(
        html,
        /<h3>\s*(?:Sample Output|出力例)\s*[\d\s]*<\/h3>\s*<pre>([\s\S]*?)<\/pre>/,
    ).map((match) => htmlPreToText(match[1]));

    const title = firstMatch(
        html,
        /<span class="h2">\s*([\s\S]*?)(?:<a\s+class="btn|<\/span>)/,
    );

    // Rendered as "Time Limit: 2 sec / Memory Limit: 1024 MiB".
    const timeLimit = parseSeconds(
        firstMatch(html, /Time Limit:\s*([\d.]+)\s*sec/i),
    );
    const memoryLimit = parseMegabytes(
        firstMatch(html, /Memory Limit:\s*([\d.]+\s*[kmgtKMGT]?[iI]?[bB])/i),
    );

    return {
        title: title === null ? null : title.replace(/<[^>]*>/g, '').trim(),
        tests: buildTests(inputs, outputs),
        timeLimit,
        memoryLimit,
    };
};

interface LuoguProblemCache {
    name?: string;
    samples?: string[][];
    limits?: { time?: number[]; memory?: number[] };
}

const parseLuogu = (html: string): FetchedProblem => {
    const raw = firstMatch(
        html,
        /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/,
    );
    if (raw === null) {
        throw new Error('Could not find Luogu problem payload');
    }

    const payload = JSON.parse(raw) as {
        data?: { problem?: LuoguProblemCache };
    };
    const problem = payload?.data?.problem;
    if (problem === undefined) {
        throw new Error('Unexpected Luogu problem payload');
    }

    const pairs = problem.samples ?? [];
    const inputs = pairs.map((pair) =>
        `${pair?.[0] ?? ''}`.replace(/\n+$/, ''),
    );
    const outputs = pairs.map((pair) =>
        `${pair?.[1] ?? ''}`.replace(/\n+$/, ''),
    );

    // Luogu reports time in milliseconds and memory in kilobytes.
    const time = problem.limits?.time?.[0];
    const memory = problem.limits?.memory?.[0];

    return {
        title: problem.name ?? null,
        tests: buildTests(inputs, outputs),
        timeLimit: typeof time === 'number' ? time : null,
        memoryLimit:
            typeof memory === 'number' ? Math.round(memory / 1024) : null,
    };
};

/* ---------------------------------------------------------------- public -- */

/**
 * Try to download the samples and limits for a problem URL. Never rejects: when
 * anything goes wrong an empty result is returned so the caller can still bind
 * the file to the problem.
 */
export const fetchProblemMetadata = async (
    url: string,
    site: ProblemSite,
): Promise<FetchedProblem> => {
    try {
        const html = await fetchText(url);
        switch (site) {
            case 'codeforces':
                return parseCodeforces(html);
            case 'luogu':
                return parseLuogu(html);
            case 'atcoder':
                return parseAtCoder(html);
        }
    } catch (err) {
        globalThis.logger?.error?.(
            'Could not fetch problem samples for',
            url,
            err,
        );
    }

    return { title: null, tests: [], timeLimit: null, memoryLimit: null };
};
