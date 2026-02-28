## Anonymous Posts

- **Feature:** Per-post anonymous posting that hides the author's identity from regular users.
- **Summary:** When posting, a checkbox can be selected to post anonymously. Posts are shown as "Anonymous" to non-privileged viewers (regular users). Administrators and moderators see the original poster information. The plugin implements a two-stage hook flow to mask identities after NodeBB populates user data.
- **How it works:**
	- **Backend - Masking Posts on Retrieval:** A plugin inspects posts on `filter:post.getFields` and, when `post.isAnonymous` is true, stores the original uid, sets `post.uid = 0` for non-privileged callers (forcing guest data to load), and flags `post.isAnonymousPost` and `_callerIsPrivileged`. The plugin uses an `ANONYMOUS_USER` constant as the masked user object and keeps `_originalUid`/_originalUser fields on the post for possible later use.
	- **Backend - User Object Replacement:** After NodeBB populates user objects, `filter:topics.addPostData` replaces the guest user object with an `ANONYMOUS_USER` placeholder (username/displayname = "Anonymous") for non-privileged viewers while preserving original user data for admins/mods.
	- **Frontend - Checkbox UI:** The composer UI includes a checkbox labeled "Post Anonymously" injected by the client code in `public/src/app.js` when the composer is enhanced for topic/post creation. The checkbox element has the attribute `data-composer-anonymous`; when changed the composer container receives `data-anonymous-post="1"` (or `0`). The checkbox is inserted after the `.title-container` inside the composer (only for `topics.post` actions), and the label text is translatable in `public/language/*/user.json` files.
	- **Frontend-to-Backend - Post Creation Flow:** The `filter:composer.submit` hook in `public/src/app.js` reads the `data-anonymous-post` attribute and sets `composerData.isAnonymous` accordingly. The backend in `src/posts/create.js` then consumes this flag and persists it as `postData.isAnonymous` on the post record in the database.
- **How to test:**
	1. Run the plugin's unit tests which cover masking and privilege visibility:

		 cd vendor/nodebb-plugin-post-fields-logger
		 npm test

		 Or run the project test runner targeting the plugin tests directly:

		 npm test -- vendor/nodebb-plugin-post-fields-logger/test/anonymous-mode.js

	2. Manual/quick checks:
		 - Create a post through the UI by clicking "Post Anonymously" checkbox in the composer.
		 - View the topic as a regular user: the post should show username/displayname "Anonymous".
		 - View the topic as an admin/mod: the post should show the original username with full user details.
- **Tests:** See the plugin README and tests:
	- [vendor/nodebb-plugin-post-fields-logger/README.md](vendor/nodebb-plugin-post-fields-logger/README.md) - Plugin documentation
	- [vendor/nodebb-plugin-post-fields-logger/index.js](vendor/nodebb-plugin-post-fields-logger/index.js) - Plugin implementation with hooks
	- [vendor/nodebb-plugin-post-fields-logger/test/anonymous-mode.js](vendor/nodebb-plugin-post-fields-logger/test/anonymous-mode.js) - Comprehensive test suite including stage 1/2 hooks, privilege-based visibility, post creation flow, and edge cases
- **Why tests are sufficient:**
	- The tests provide comprehensive coverage across multiple test suites:
		- **Stage 1 Hook (`filter:post.getFields`) Tests:** Validates UID masking for non-privileged viewers, preserves original UID for privileged viewers (admins/mods), and handles privilege detection correctly.
		- **Stage 2 Hook (`filter:topics.addPostData`) Tests:** Verifies user object replacement with `ANONYMOUS_USER` placeholder for non-privileged viewers, preserves original user data for privileged viewers, and correctly handles mixed anonymous/non-anonymous posts.
		- **Privilege-Based Visibility Tests:** Tests instructor viewing student anonymous post (shows real identity), student viewing another student's anonymous post (shows "Anonymous"), and post author viewing their own anonymous post.
		- **Post Creation Flow Tests:** Validates that the `filter:composer.submit` hook captures checkbox state and `src/posts/create.js` persists the `isAnonymous` flag to the database, covering the complete frontend-to-backend integration.
		- **Edge Cases:** String/boolean type coercion for Redis storage ("true" as truthy), false/0 values not triggering masking, double-processing protection (`_originalUid`/`_originalUser`/`_originalHandle` preservation), missing caller context defaults to masking, handle field conditional setting, and `ANONYMOUS_USER` constant immutability.
	- Together, the tests ensure that posts created with the anonymous flag are properly stored and retrieved with correct visibility behavior based on viewer privileges throughout the entire system lifecycle.

## LaTeX Integration and Testing

- **Feature:** LaTeX button in the composer toolbar and MathJax rendering for math equations in posts and topics.
- **Summary:** Adds a LaTeX button to the NodeBB composer that wraps selected text in `$$` delimiters (or inserts `$$ $$` when nothing is selected) for display math, and injects MathJax from a CDN so that LaTeX/TeX equations render correctly in topic views and composer preview.
- **How it works:**
	- **Backend - Formatting Registration:** The plugin hooks into `filter:composer.formatting` in [library.js](vendor/nodebb-plugin-composer-latex/library.js). `registerFormatting` adds a `latex` option to the payload with `name: 'latex'`, `className: 'fa fa-superscript'`, and visibility for mobile/desktop/main/reply. It preserves any existing formatting options.
	- **Backend - MathJax Script Injection:** The plugin hooks into `filter:middleware.renderHeader`. `addMathJaxScript` appends MathJax configuration and the MathJax CDN script (`https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js`) into `templateData.useCustomHTML`, so every page load includes MathJax. It appends to existing `useCustomHTML` when present.
	- **Frontend - LaTeX Button:** In [public/js/client.js](vendor/nodebb-plugin-composer-latex/public/js/client.js), the plugin listens for `action:composer.enhanced` and registers a button dispatch via `formatting.addButtonDispatch('latex', ...)`. On click, it either wraps the selection in `$$...$$` or inserts `$$ $$` with the cursor between them. It then triggers the composer preview.
	- **Frontend - MathJax Rendering:** [public/js/mathjax.js](vendor/nodebb-plugin-composer-latex/public/js/mathjax.js) configures MathJax for inline (`$...$`, `\(...\)`) and display (`$$...$$`, `\[...\]`) math. It loads MathJax from the CDN on demand, runs `typesetPromise` on page load and when the composer preview updates, and handles the case where the header script is already present.
- **How to test:**
	1. Run the LaTeX plugin unit tests:

		 npm test -- test/plugins-composer-latex.js

		 Or run the plugin's tests directly:

		 cd vendor/nodebb-plugin-composer-latex
		 npm test

	2. Manual/quick checks:
		 - Start NodeBB and open the composer (new topic or reply).
		 - Confirm a LaTeX (superscript) button appears in the formatting toolbar.
		 - Click the button with no selection: `$$ $$` should be inserted with cursor between.
		 - Select text and click the button: text should be wrapped in `$$...$$`.
		 - Submit a post containing `$E = mc^2$` or `$$\int_0^1 x^2 dx$$`.
		 - View the topic: equations should render as math (not raw LaTeX).
		 - Check the composer preview: equations should render live as you type.
- **Tests:** Links to automated test files:
	- [test/plugins-composer-latex.js](test/plugins-composer-latex.js) - Entry point that loads the plugin unit tests
	- [vendor/nodebb-plugin-composer-latex/test/composer-latex.js](vendor/nodebb-plugin-composer-latex/test/composer-latex.js) - Unit tests for `registerFormatting` and `addMathJaxScript`
- **Why tests are sufficient:**
	- **registerFormatting tests:** Verify that the latex option is added with correct name, className, title, and visibility (mobile/desktop); that existing options are preserved; and that an empty or missing `options` array is handled correctly.
	- **addMathJaxScript tests:** Verify that MathJax config and script are injected into `templateData.useCustomHTML` with the expected content (mathjax, script, cdn.jsdelivr.net); that injection appends to existing `useCustomHTML`; and that nothing is done when `templateData` is missing.
	- These unit tests cover the backend hooks that power the LaTeX feature. The frontend button dispatch and MathJax client-side behavior are exercised via manual/end-to-end testing, which is appropriate because they depend on the NodeBB composer UI and DOM. Together, the tests ensure the plugin integrates correctly with NodeBB's formatting and header middleware, and that the math rendering pipeline is correctly configured.



## Listing Responders to a Post

- **Feature:** A list containing all the users that responded to a post.
- **Summary:** A short paragraph explaining what the feature does and why it was added.
- **How it works:** Technical explanation of the design and flow (components touched, data flow, important edge cases).
- **How to test:** Step-by-step manual test instructions and any automated test commands.
- **Tests:** Link(s) to the actual automated test files that cover this feature.
- **Why tests are sufficient:** Short rationale describing what the tests cover and any remaining gaps.

  
## Fuzzy Search Testing

- **Feature:** The "Fuzzy match" search dropdown option supports fuzzy search.
- **Summary:** "Fuzzy match" enables users to input search queries and receive post results with low edit distances (word similarity). It supports input queries that with insertions, deletions, and substitutions. Relevant posts with high word similarity (minimal edit distance) appear. This feature was added to provide users with searching flexibility. Users can have typos into their search queries and still receive relevant post results.
- **How it works:** The fuzzy search feature was mainly implemented in public/src/modules/search.js. getLevenshteinDistance(a, b) computes the minimum edit distance (insertions, deletions, substitutions) between two strings using dynamic programming. fuzzyMatches(query, text) tokenizes both the query and the text, then checks if any query token is within an acceptable edit distance of any text token. The tolerance threshold scales with token length via maxFuzzyEdits(len): <= 5 chars for 1 edit, <= 9 chars for 2 edits, 10+ chars for 3 edits. There is also substring matching fallback. getFuzzyMatchRanges(query, text) traces back through the Levenshtein dynamic programming matrix to find which character positions in text align with the query, returning [start, end] ranges. highlightFuzzyInText() wraps these ranges for underlining relevant characters. 
- **Data Flow:**User selects "Fuzzy match" from the search dropdown. matchWords=fuzzy is sent as a query parameter. src/controllers/search.js passes it into template data. public/src/client/search.js reads it from the data-match-words attribute on the results container and calls Search.highlightMatches(query, els, 'fuzzy'), which uses the fuzzy highlighting path instead of the exact-regex path.
- **Edge Cases:**Empty queries return no matches. Single-character tokens are skipped during highlighting. 
- **How to test:** 
	1) Start NodeBB locally (./nodebb dev)
	2) Create a few posts with known words (e.g., "hello world", "test post")
	3) Go to the search page, select "Fuzzy match" from the match-words dropdown
	4) Search "helo" → should return the "hello" post, with "hello" underlined (shared characters highlighted)
	5) Search "tests" → should return the "test" post
	6) Search "jello" → should not return the "hello" post
	7) Switch to "Match all words" → confirm highlighting reverts to exact bold+underline behavior
	8) Automated tests can be run via `npx mocha test/search-fuzzy.js`
- **Tests:** test/fuzzy-search.js
- **Test Sufficiency:** The unit tests test the two core functions getLevenshteinDistance and fuzzyMatches, which contain all fuzzy matching logic. The unit tests cover correctness of edit distance, acceptance of small typos, rejection of unrelated words beyond threshold edit distance, edge cases, and substring matching fallback. 
