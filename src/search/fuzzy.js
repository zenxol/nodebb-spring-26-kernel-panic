'use strict';

function levenshtein(a, b) {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	const m = a.length;
	const n = b.length;
	const d = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
	for (let i = 0; i <= m; i++) d[i][0] = i;
	for (let j = 0; j <= n; j++) d[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
		}
	}
	return d[m][n];
}

function maxFuzzyEdits(tokenLength) {
	if (tokenLength <= 5) return 1;
	if (tokenLength <= 9) return 2;
	return 3;
}

function fuzzyMatches(query, text) {
	const queryTokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
	const textTokens = String(text || '').toLowerCase().match(/\p{L}+/gu) || [];
	if (!queryTokens.length || !textTokens.length) return false;
	return queryTokens.some((qt) => {
		const allowed = maxFuzzyEdits(qt.length);
		return textTokens.some((tt) => {
			const dist = levenshtein(qt, tt);
			return dist <= allowed || tt.includes(qt) || qt.includes(tt);
		});
	});
}

exports.levenshtein = levenshtein;
exports.maxFuzzyEdits = maxFuzzyEdits;
exports.fuzzyMatches = fuzzyMatches;
