'use strict';

const { fetch } = require('undici');

const plugin = module.exports;

const DEFAULT_BASE = process.env.TRANSLATOR_SERVICE_URL || 'http://127.0.0.1:5001';
const TIMEOUT_MS = parseInt(process.env.TRANSLATOR_TIMEOUT_MS || '90000', 10);

async function translateContent(rawContent) {
	if (rawContent === undefined || rawContent === null) {
		return null;
	}
	const str = String(rawContent);
	const trimmed = str.trim();
	if (!trimmed) {
		return null;
	}

	const base = DEFAULT_BASE.replace(/\/$/, '');
	const url = `${base}/?content=${encodeURIComponent(trimmed)}`;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, { signal: ac.signal });
		if (!res.ok) {
			return null;
		}
		const body = await res.json();
		if (!body || typeof body !== 'object') {
			return null;
		}
		if (body.is_english === true) {
			return null;
		}
		if (typeof body.translated_content !== 'string') {
			return null;
		}
		return body.translated_content;
	} catch (err) {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

plugin.onPostCreate = async function (payload) {
	const { post, data } = payload;
	if (post && post.content) {
		const translated = await translateContent(post.content);
		if (translated !== null) {
			post.content = translated;
			if (data && Object.prototype.hasOwnProperty.call(data, 'content')) {
				data.content = translated;
			}
		}
	}
	return payload;
};

plugin.onPostEdit = async function (payload) {
	const { post } = payload;
	if (post && post.content !== undefined && post.content !== null) {
		const translated = await translateContent(post.content);
		if (translated !== null) {
			post.content = translated;
			if (payload.data && Object.prototype.hasOwnProperty.call(payload.data, 'content')) {
				payload.data.content = translated;
			}
		}
	}
	return payload;
};
