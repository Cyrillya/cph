# Changelog

## Unreleased ( fork )

-   Metadata and build artifacts are kept in one folder. Compiled `.bin` files
    now live next to the `.prob` files instead of beside your source code.
-   Save location accepts relative paths ( resolved against the source file's
    directory ), `${workspaceFolder}` and absolute paths, and the folder is
    created automatically. Leaving it empty uses a `.cph` folder beside the
    source file.
-   Problem metadata now stores relative paths, so sources can be moved between
    machines without losing their problems. Existing problem files are migrated
    automatically.
-   Configurable prefix for short problem names ( Codeforces, Luogu, AtCoder ),
    e.g. `cf144C.cpp`.
-   New "Link Problem from URL" option ( and `cph.linkProblemToUrl` command ) to
    bind an existing source file to a Codeforces / Luogu / AtCoder problem, with
    sample tests downloaded when available.
-   New `cph.general.lowercaseImportedFileName` setting: lowercases the file
    name of every imported problem ( any website ), e.g. `cf123B.cpp` becomes
    `cf123b.cpp`. The file extension is never changed.
-   Custom checker script paths are now relative to the source file's folder:
    `checker.py` next to `abc.cpp` is entered as `checker.py`. Absolute paths
    still work, and paths stored by previous versions are converted on load.

## 5.9.2

-   Minor UI improvments for small sidebar widths.

## 5.9.1

-   Improve problem name parser to handle numbers.

## 5.9.0

-   Support non-latin alphabet for problem names.

## 5.8.9

-   Companion server now listens for errors and notifies users.

## 5.8.8

-   Add support for C++ 20.
-   Save file before submission.

## 5.8.1

-   Add icons to UI.
-   Add minimum width warning.

## 5.0.7

-   Fix missed messages bug when webview is not focussed.

## 5.0.6

-   Fix codeforces short name bug.

## 5.0.5

-   Add option to disable auto focus of judge view.

## 5.0.4

-   Add option to retain webview context.

## 5.0.2

-   Fix minor layout bugs.
-   Improve URL rendering.
-   Improve error messages.
-   Add button to problem URL.

## 5.0.0

-   Brand new UI with improved performance. The UI now appears in the activity
    bar ( side bar ).
-   No more weird layout bugs.
-   Lower system resource usage when extension is in the background.

## 4.5.3

-   Fix ghost .cph folder creation bug.

## 4.5.2

-   Fix layout bugs.
-   Add setting to load default template.

## 4.5.1

-   Added AppInsights.

## 4.5.0

-   Added support for changing python executable.
-   Added support for changing default compiler for Codeforces submissions.

## 4.4.2

-   Added support for Kattis auto submit.

## 4.4.0

-   Show standard error when it's not empty.

## 4.3.0

-   cph-sumbit integration for directly submitting to CodeForces.

## 4.2.0

-   Shows error if unable to spawn compiler/interpreter.
-   Ability to delete a testcase file permanently.

## 4.1.0

-   Improved large testcase editing performance by defering saves.
-   Suffix problem names with MD5 hashes to prevent same-name-collisions.
-   OS specific deletion bug fixes.
-   Show compilation status in UI.

## 4.0.3

-   Fix problem with immediately exiting processes.

## 4.0.2

-   Fix webview resources loading.

## 4.0.1

-   Fox conflicts with previous releases.

## 4.0.0

-   Complete migration to typescript
-   Rewrite from scratch with a completely new logic for better performance,
    stability and more features.

## Before 4.0.0

Release notes from before 4.0.0 are not available.
