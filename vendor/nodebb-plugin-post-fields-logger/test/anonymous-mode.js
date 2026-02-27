'use strict';

const assert = require('assert');

// Mock user module for testing
const mockUser = {
	isAdminOrGlobalMod: async (uid) => {
		// UIDs 1-10 are admins for testing
		return uid >= 1 && uid <= 10;
	},
	isModeratorOfAnyCategory: async (uid) => {
		// UIDs 11-20 are moderators for testing
		return uid >= 11 && uid <= 20;
	},
};

// Import the plugin directly for unit testing
const plugin = require('../index');

// Inject mock user module before tests
plugin._setUserModule(mockUser);

describe('Post Fields Logger Plugin - Anonymous Mode', () => {
	describe('maskPostUserIdentity', () => {
		it('should return null/undefined posts unchanged', () => {
			assert.strictEqual(plugin.maskPostUserIdentity(null), null);
			assert.strictEqual(plugin.maskPostUserIdentity(undefined), undefined);
		});

		it('should mask uid and store original', () => {
			const post = { uid: 123, content: 'test content' };
			const result = plugin.maskPostUserIdentity(post);

			assert.strictEqual(result.uid, 0);
			assert.strictEqual(result._originalUid, 123);
		});

		it('should replace user object with anonymous placeholder', () => {
			const post = {
				uid: 123,
				user: {
					uid: 123,
					username: 'testuser',
					displayname: 'Test User',
					userslug: 'testuser',
					picture: 'http://example.com/pic.jpg',
					status: 'online',
				},
			};
			const result = plugin.maskPostUserIdentity(post);

			assert.strictEqual(result.user.uid, 0);
			assert.strictEqual(result.user.username, 'Anonymous');
			assert.strictEqual(result.user.displayname, 'Anonymous');
			assert.strictEqual(result.user.userslug, '');
			assert.strictEqual(result.user.picture, null);
			assert.strictEqual(result.user['icon:text'], '?');
			assert.strictEqual(result.user['icon:bgColor'], '#888888');

			// Original should be preserved
			assert.strictEqual(result._originalUser.uid, 123);
			assert.strictEqual(result._originalUser.username, 'testuser');
		});

		it('should mask handle field if present', () => {
			const post = { uid: 0, handle: 'GuestUser' };
			const result = plugin.maskPostUserIdentity(post);

			assert.strictEqual(result.handle, 'Anonymous');
			assert.strictEqual(result._originalHandle, 'GuestUser');
		});

		it('should handle posts without user object', () => {
			const post = { uid: 123, content: 'test' };
			const result = plugin.maskPostUserIdentity(post);

			assert.strictEqual(result.uid, 0);
			assert.strictEqual(result._originalUid, 123);
			assert.strictEqual(result.user, undefined);
		});
	});

	describe('isCallerPrivileged', () => {
		it('should return false for null uid', async () => {
			const result = await plugin.isCallerPrivileged(null);
			assert.strictEqual(result, false);
		});

		it('should return false for undefined uid', async () => {
			const result = await plugin.isCallerPrivileged(undefined);
			assert.strictEqual(result, false);
		});

		it('should return false for uid 0 (guest)', async () => {
			const result = await plugin.isCallerPrivileged(0);
			assert.strictEqual(result, false);
		});

		it('should return false for uid -1 (spider/bot)', async () => {
			const result = await plugin.isCallerPrivileged(-1);
			assert.strictEqual(result, false);
		});

		it('should return true for admin uid (1-10)', async () => {
			const result = await plugin.isCallerPrivileged(5);
			assert.strictEqual(result, true);
		});

		it('should return true for moderator uid (11-20)', async () => {
			const result = await plugin.isCallerPrivileged(15);
			assert.strictEqual(result, true);
		});

		it('should return false for regular user uid (>20)', async () => {
			const result = await plugin.isCallerPrivileged(100);
			assert.strictEqual(result, false);
		});
	});

	describe('onPostGetFields (Stage 1 - marks posts and masks uid)', () => {
		it('should return hookData unchanged if no posts', async () => {
			const hookData = { pids: [], fields: [], posts: null };
			const result = await plugin.onPostGetFields(hookData);
			assert.deepStrictEqual(result, hookData);
		});

		it('should return hookData unchanged if posts is empty array', async () => {
			const hookData = { pids: [], fields: [], posts: [] };
			const result = await plugin.onPostGetFields(hookData);
			assert.deepStrictEqual(result, hookData);
		});

		it('should not mask non-anonymous posts', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: false,
					user: { uid: 123, username: 'testuser' },
				}],
				caller: { uid: 456 },
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0].uid, 123);
			assert.strictEqual(result.posts[0].user.username, 'testuser');
			assert.strictEqual(result.posts[0].isAnonymousPost, undefined);
		});

		it('should mask uid for anonymous posts for regular users (guest)', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser', displayname: 'Test User' },
				}],
				caller: { uid: 0 }, // Guest user
			};
			const result = await plugin.onPostGetFields(hookData);

			// Stage 1 only masks uid, not user object
			assert.strictEqual(result.posts[0].uid, 0);
			assert.strictEqual(result.posts[0]._originalUid, 123);
			assert.strictEqual(result.posts[0].isAnonymousPost, true);
			assert.strictEqual(result.posts[0]._callerIsPrivileged, false);
			// User object is NOT replaced in Stage 1
			assert.strictEqual(result.posts[0].user.username, 'testuser');
		});

		it('should mask uid when no caller context', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser' },
				}],
				// No caller property
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0].uid, 0);
			assert.strictEqual(result.posts[0].isAnonymousPost, true);
			assert.strictEqual(result.posts[0]._callerIsPrivileged, false);
		});

		it('should handle mixed anonymous and non-anonymous posts', async () => {
			const hookData = {
				pids: [1, 2, 3],
				fields: [],
				posts: [
					{
						pid: 1,
						uid: 100,
						isAnonymous: true,
						user: { uid: 100, username: 'user1' },
					},
					{
						pid: 2,
						uid: 200,
						isAnonymous: false,
						user: { uid: 200, username: 'user2' },
					},
					{
						pid: 3,
						uid: 300,
						isAnonymous: true,
						user: { uid: 300, username: 'user3' },
					},
				],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			// First post - anonymous, uid should be masked
			assert.strictEqual(result.posts[0].uid, 0);
			assert.strictEqual(result.posts[0]._originalUid, 100);
			assert.strictEqual(result.posts[0].isAnonymousPost, true);

			// Second post - not anonymous, should be unchanged
			assert.strictEqual(result.posts[1].uid, 200);
			assert.strictEqual(result.posts[1].isAnonymousPost, undefined);

			// Third post - anonymous, uid should be masked
			assert.strictEqual(result.posts[2].uid, 0);
			assert.strictEqual(result.posts[2]._originalUid, 300);
			assert.strictEqual(result.posts[2].isAnonymousPost, true);
		});

		it('should handle null posts in array', async () => {
			const hookData = {
				pids: [1, 2],
				fields: [],
				posts: [
					null,
					{
						pid: 2,
						uid: 200,
						isAnonymous: true,
						user: { uid: 200, username: 'user2' },
					},
				],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0], null);
			assert.strictEqual(result.posts[1].uid, 0);
			assert.strictEqual(result.posts[1].isAnonymousPost, true);
		});

		it('should preserve content and other non-identity fields', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					tid: 10,
					uid: 123,
					content: 'This is my post content',
					timestamp: 1234567890,
					votes: 5,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser' },
				}],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			// uid should be masked
			assert.strictEqual(result.posts[0].uid, 0);
			assert.strictEqual(result.posts[0]._originalUid, 123);

			// Other fields should be preserved
			assert.strictEqual(result.posts[0].pid, 1);
			assert.strictEqual(result.posts[0].tid, 10);
			assert.strictEqual(result.posts[0].content, 'This is my post content');
			assert.strictEqual(result.posts[0].timestamp, 1234567890);
			assert.strictEqual(result.posts[0].votes, 5);
		});
	});

	describe('onTopicsAddPostData (Stage 2 - replaces user data)', () => {
		it('should return hookData unchanged if no posts', async () => {
			const hookData = { posts: null, uid: 0 };
			const result = await plugin.onTopicsAddPostData(hookData);
			assert.deepStrictEqual(result, hookData);
		});

		it('should return hookData unchanged if posts is empty array', async () => {
			const hookData = { posts: [], uid: 0 };
			const result = await plugin.onTopicsAddPostData(hookData);
			assert.deepStrictEqual(result, hookData);
		});

		it('should replace user data for non-privileged anonymous posts', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					_callerIsPrivileged: false,
					user: { uid: 0, username: '[[global:guest]]', displayname: '[[global:guest]]' },
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
			assert.strictEqual(result.posts[0].user.displayname, 'Anonymous');
			assert.strictEqual(result.posts[0].handle, 'Anonymous');
		});

		it('should NOT replace user data for privileged viewers', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 123, // Original uid preserved for admins
					isAnonymousPost: true,
					_callerIsPrivileged: true,
					user: { uid: 123, username: 'testuser', displayname: 'Test User' },
				}],
				uid: 5, // Admin viewer
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			// User data should be unchanged for admins
			assert.strictEqual(result.posts[0].user.username, 'testuser');
			assert.strictEqual(result.posts[0].user.displayname, 'Test User');
		});

		it('should NOT touch posts that are not marked as anonymous', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymousPost: undefined,
					user: { uid: 123, username: 'testuser' },
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			assert.strictEqual(result.posts[0].user.username, 'testuser');
		});

		it('should preserve normal guest posts (not anonymous)', async () => {
			// This is a regular guest post, not an anonymous post
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					// No isAnonymousPost flag - this is a real guest
					user: { uid: 0, username: '[[global:guest]]' },
					handle: 'John Doe',
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			// Guest data should be preserved
			assert.strictEqual(result.posts[0].user.username, '[[global:guest]]');
			assert.strictEqual(result.posts[0].handle, 'John Doe');
		});

		it('should handle mixed posts correctly', async () => {
			const hookData = {
				posts: [
					{
						pid: 1,
						uid: 0,
						isAnonymousPost: true,
						_callerIsPrivileged: false,
						user: { uid: 0, username: '[[global:guest]]' },
					},
					{
						pid: 2,
						uid: 0,
						// Regular guest, not anonymous
						user: { uid: 0, username: '[[global:guest]]' },
						handle: 'Guest John',
					},
					{
						pid: 3,
						uid: 200,
						// Regular logged in user
						user: { uid: 200, username: 'normaluser' },
					},
				],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			// Anonymous post - should show "Anonymous"
			assert.strictEqual(result.posts[0].user.username, 'Anonymous');

			// Regular guest - should still be guest
			assert.strictEqual(result.posts[1].user.username, '[[global:guest]]');
			assert.strictEqual(result.posts[1].handle, 'Guest John');

			// Regular user - unchanged
			assert.strictEqual(result.posts[2].user.username, 'normaluser');
		});

		it('should store original user data before replacing', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					_callerIsPrivileged: false,
					user: { uid: 0, username: '[[global:guest]]', displayname: '[[global:guest]]' },
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			assert.strictEqual(result.posts[0]._originalUser.username, '[[global:guest]]');
			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
		});
	});

	describe('Admin/Moderator visibility (using mock user module)', () => {
		// Mock user module: UIDs 1-10 are admins, 11-20 are mods, >20 are regular users

		it('should NOT mask uid for admins (uid 1-10)', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser', displayname: 'Test User' },
				}],
				caller: { uid: 5 }, // Admin user (uid 1-10)
			};
			const result = await plugin.onPostGetFields(hookData);

			// uid should NOT be masked for admin
			assert.strictEqual(result.posts[0].uid, 123);
			assert.strictEqual(result.posts[0].user.username, 'testuser');
			assert.strictEqual(result.posts[0].user.displayname, 'Test User');

			// But should still have the anonymous flag and privileged marker
			assert.strictEqual(result.posts[0].isAnonymousPost, true);
			assert.strictEqual(result.posts[0]._callerIsPrivileged, true);

			// Should NOT have _originalUid since uid was not changed
			assert.strictEqual(result.posts[0]._originalUid, undefined);
		});

		it('should NOT mask uid for moderators (uid 11-20)', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser', displayname: 'Test User' },
				}],
				caller: { uid: 15 }, // Moderator user (uid 11-20)
			};
			const result = await plugin.onPostGetFields(hookData);

			// uid should NOT be masked for moderator
			assert.strictEqual(result.posts[0].uid, 123);
			assert.strictEqual(result.posts[0].user.username, 'testuser');
			assert.strictEqual(result.posts[0].isAnonymousPost, true);
			assert.strictEqual(result.posts[0]._callerIsPrivileged, true);
			assert.strictEqual(result.posts[0]._originalUid, undefined);
		});

		it('should mask uid for regular logged-in users (uid >20)', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser' },
				}],
				caller: { uid: 100 }, // Regular user (uid >20)
			};
			const result = await plugin.onPostGetFields(hookData);

			// uid should be masked (Stage 1)
			assert.strictEqual(result.posts[0].uid, 0);
			assert.strictEqual(result.posts[0]._originalUid, 123);
			assert.strictEqual(result.posts[0].isAnonymousPost, true);
			assert.strictEqual(result.posts[0]._callerIsPrivileged, false);
			// User object is not replaced in Stage 1
			assert.strictEqual(result.posts[0].user.username, 'testuser');
		});

		it('should allow admin to see all original user data after both stages', async () => {
			// Stage 1: onPostGetFields
			const stage1Data = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: {
						uid: 123,
						username: 'secretuser',
						displayname: 'Secret User',
						userslug: 'secretuser',
						picture: 'http://example.com/secret.jpg',
						reputation: 100,
						postcount: 50,
					},
				}],
				caller: { uid: 1 }, // Admin
			};
			const stage1Result = await plugin.onPostGetFields(stage1Data);

			// Stage 2: onTopicsAddPostData
			const stage2Data = {
				posts: stage1Result.posts,
				uid: 1, // Admin
			};
			const result = await plugin.onTopicsAddPostData(stage2Data);

			// All original data should be visible for admin
			assert.strictEqual(result.posts[0].user.username, 'secretuser');
			assert.strictEqual(result.posts[0].user.displayname, 'Secret User');
			assert.strictEqual(result.posts[0].user.picture, 'http://example.com/secret.jpg');
			assert.strictEqual(result.posts[0].user.reputation, 100);
		});

		it('should handle post author viewing their own anonymous post', async () => {
			// Even if the post author is viewing, they should see anonymous
			// (unless they are admin/mod)
			const stage1Data = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 100, // Post author
					isAnonymous: true,
					user: { uid: 100, username: 'author' },
				}],
				caller: { uid: 100 }, // Same user viewing their own post
			};
			const stage1Result = await plugin.onPostGetFields(stage1Data);

			// Stage 1: uid should be masked
			assert.strictEqual(stage1Result.posts[0].uid, 0);
			assert.strictEqual(stage1Result.posts[0]._originalUid, 100);

			// Stage 2: user data should be replaced with anonymous
			const stage2Data = {
				posts: stage1Result.posts,
				uid: 100,
			};
			const result = await plugin.onTopicsAddPostData(stage2Data);

			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
		});
	});

	describe('Full flow integration (Stage 1 + Stage 2)', () => {
		it('should show Anonymous for regular users after both stages', async () => {
			// Stage 1
			const stage1Data = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 123,
					isAnonymous: true,
					user: { uid: 123, username: 'testuser' },
				}],
				caller: { uid: 0 }, // Guest
			};
			const stage1Result = await plugin.onPostGetFields(stage1Data);

			// Simulate NodeBB populating guest user data (what would happen in real flow)
			stage1Result.posts[0].user = {
				uid: 0,
				username: '[[global:guest]]',
				displayname: '[[global:guest]]',
			};

			// Stage 2
			const stage2Data = {
				posts: stage1Result.posts,
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(stage2Data);

			// Should show Anonymous, not Guest
			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
			assert.strictEqual(result.posts[0].user.displayname, 'Anonymous');
		});

		it('should not affect a regular (non-anonymous) logged-in post', async () => {
			// A normal post by a logged-in student with isAnonymous not set
			const hookData = {
				posts: [{
					pid: 1,
					uid: 100,
					user: { uid: 100, username: 'student1', displayname: 'Student One' },
				}],
				uid: 200, // Another logged-in student viewing
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			// Should remain unchanged - no masking on regular posts
			assert.strictEqual(result.posts[0].user.username, 'student1');
			assert.strictEqual(result.posts[0].uid, 100);
		});

		it('should show real identity to instructor viewing a student anonymous post', async () => {
			// Student (uid 100) posts anonymously. Instructor (uid 5) views.
			// Stage 1: instructor is privileged, uid NOT masked
			const stage1Data = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 100,
					isAnonymous: true,
					user: { uid: 100, username: 'student1', displayname: 'Student One' },
				}],
				caller: { uid: 5 }, // Instructor (admin uid 1-10)
			};
			const stage1Result = await plugin.onPostGetFields(stage1Data);

			// Stage 1: uid preserved for privileged viewer
			assert.strictEqual(stage1Result.posts[0].uid, 100);
			assert.strictEqual(stage1Result.posts[0]._callerIsPrivileged, true);

			// Stage 2: instructor still sees real identity
			const stage2Data = { posts: stage1Result.posts, uid: 5 };
			const result = await plugin.onTopicsAddPostData(stage2Data);

			assert.strictEqual(result.posts[0].user.username, 'student1');
			assert.strictEqual(result.posts[0].user.displayname, 'Student One');
			assert.strictEqual(result.posts[0].uid, 100);
		});

		it('should hide identity from a student viewing another student\'s anonymous post', async () => {
			// Student (uid 100) posts anonymously. Another student (uid 200) views.
			// Stage 1: regular user, uid IS masked
			const stage1Data = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 100,
					isAnonymous: true,
					user: { uid: 100, username: 'student1', displayname: 'Student One' },
				}],
				caller: { uid: 200 }, // Another student (uid > 20, not privileged)
			};
			const stage1Result = await plugin.onPostGetFields(stage1Data);

			// Stage 1: uid masked for non-privileged viewer
			assert.strictEqual(stage1Result.posts[0].uid, 0);
			assert.strictEqual(stage1Result.posts[0]._originalUid, 100);

			// Simulate NodeBB loading guest user data after uid was set to 0
			stage1Result.posts[0].user = { uid: 0, username: '[[global:guest]]', displayname: '[[global:guest]]' };

			// Stage 2: student sees "Anonymous"
			const stage2Data = { posts: stage1Result.posts, uid: 200 };
			const result = await plugin.onTopicsAddPostData(stage2Data);

			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
			assert.strictEqual(result.posts[0].user.displayname, 'Anonymous');
			assert.strictEqual(result.posts[0].handle, 'Anonymous');
		});
	});

	describe('Edge cases', () => {
		it('should treat isAnonymous stored as string "true" as anonymous (Redis storage)', async () => {
			// Redis stores all values as strings; "true" is truthy in JS
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{ pid: 1, uid: 123, isAnonymous: 'true' }],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0].isAnonymousPost, true);
			assert.strictEqual(result.posts[0].uid, 0);
		});

		it('should not mask posts where isAnonymous is false', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{ pid: 1, uid: 123, isAnonymous: false, user: { uid: 123, username: 'user1' } }],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0].uid, 123);
			assert.strictEqual(result.posts[0].isAnonymousPost, undefined);
		});

		it('should not mask posts where isAnonymous is 0', async () => {
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{ pid: 1, uid: 123, isAnonymous: 0, user: { uid: 123, username: 'user1' } }],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0].uid, 123);
			assert.strictEqual(result.posts[0].isAnonymousPost, undefined);
		});

		it('should not overwrite _originalUid if already set on the post', async () => {
			// Protects against double-processing
			const hookData = {
				pids: [1],
				fields: [],
				posts: [{
					pid: 1,
					uid: 0, // Already masked
					_originalUid: 123, // Already stored
					isAnonymous: true,
				}],
				caller: { uid: 0 },
			};
			const result = await plugin.onPostGetFields(hookData);

			assert.strictEqual(result.posts[0]._originalUid, 123);
		});

		it('should not overwrite _originalUser if already set in stage 2', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					_callerIsPrivileged: false,
					_originalUser: { uid: 123, username: 'alreadystored' },
					user: { uid: 0, username: '[[global:guest]]' },
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			// _originalUser should not be overwritten
			assert.strictEqual(result.posts[0]._originalUser.username, 'alreadystored');
			// user should still be replaced with Anonymous
			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
		});

		it('should not overwrite _originalHandle if already set in stage 2', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					_callerIsPrivileged: false,
					user: { uid: 0, username: '[[global:guest]]' },
					handle: 'SomeHandle',
					_originalHandle: 'OriginalHandle',
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			assert.strictEqual(result.posts[0]._originalHandle, 'OriginalHandle');
			assert.strictEqual(result.posts[0].handle, 'Anonymous');
		});

		it('should not set handle to Anonymous when post has no handle', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					_callerIsPrivileged: false,
					user: { uid: 0, username: '[[global:guest]]' },
					// no handle field
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			assert.strictEqual(result.posts[0].handle, 'Anonymous');
		});

		it('should treat missing _callerIsPrivileged as non-privileged and mask post', async () => {
			// If Stage 1 didn't set _callerIsPrivileged, default to masking
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					// _callerIsPrivileged deliberately absent
					user: { uid: 0, username: '[[global:guest]]' },
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			assert.strictEqual(result.posts[0].user.username, 'Anonymous');
		});

		it('ANONYMOUS_USER constant should have the correct fields', () => {
			const anon = plugin.ANONYMOUS_USER;

			assert.strictEqual(anon.uid, 0);
			assert.strictEqual(anon.username, 'Anonymous');
			assert.strictEqual(anon.displayname, 'Anonymous');
			assert.strictEqual(anon.userslug, '');
			assert.strictEqual(anon.picture, null);
			assert.strictEqual(anon['icon:text'], '?');
			assert.strictEqual(anon['icon:bgColor'], '#888888');
			assert.strictEqual(anon.status, 'offline');
		});

		it('stage 2 masking should be a copy, not a reference to ANONYMOUS_USER', async () => {
			const hookData = {
				posts: [{
					pid: 1,
					uid: 0,
					isAnonymousPost: true,
					_callerIsPrivileged: false,
					user: { uid: 0, username: '[[global:guest]]' },
				}],
				uid: 0,
			};
			const result = await plugin.onTopicsAddPostData(hookData);

			// Mutating the returned user object should not affect the ANONYMOUS_USER constant
			result.posts[0].user.username = 'mutated';
			assert.strictEqual(plugin.ANONYMOUS_USER.username, 'Anonymous');
		});
	});

	describe('onTopicsGet (topic list anonymous masking)', () => {
		const anonMainPids = new Set([101]);
		const anonTeaserPids = new Set([102]);

		before(() => {
			plugin._setDb({
				getObjects: async (keys, fields) => keys.map((key) => {
					const pid = parseInt(key.replace('post:', ''), 10);
					const isAnonymous = anonMainPids.has(pid) || anonTeaserPids.has(pid);
					return { pid, isAnonymous };
				}),
			});
		});

		after(() => {
			plugin._setDb(null);
		});

		it('should mask topic.user and topic.teaser.user for anonymous posts when viewer is not privileged', async () => {
			const hookData = {
				uid: 100,
				topics: [
					{
						mainPid: 101,
						teaser: { pid: 102, user: { uid: 50, username: 'realuser', displayname: 'Real User', userslug: 'realuser' } },
						user: { uid: 50, username: 'realuser', displayname: 'Real User', userslug: 'realuser' },
					},
				],
			};
			const result = await plugin.onTopicsGet(hookData);

			assert.strictEqual(result.topics[0].user.username, 'Anonymous');
			assert.strictEqual(result.topics[0].user.displayname, 'Anonymous');
			assert.strictEqual(result.topics[0].teaser.user.username, 'Anonymous');
			assert.strictEqual(result.topics[0].teaser.user.displayname, 'Anonymous');
		});

		it('should NOT mask topic.user or topic.teaser.user when viewer is privileged (admin)', async () => {
			const hookData = {
				uid: 5,
				topics: [
					{
						mainPid: 101,
						teaser: { pid: 102, user: { uid: 50, username: 'realuser', displayname: 'Real User' } },
						user: { uid: 50, username: 'realuser', displayname: 'Real User' },
					},
				],
			};
			const result = await plugin.onTopicsGet(hookData);

			assert.strictEqual(result.topics[0].user.username, 'realuser');
			assert.strictEqual(result.topics[0].teaser.user.username, 'realuser');
		});

		it('should only mask main post user when main is anonymous and teaser is not', async () => {
			anonMainPids.add(201);
			// 202 is not in anonTeaserPids
			const hookData = {
				uid: 100,
				topics: [
					{
						mainPid: 201,
						teaser: { pid: 202, user: { uid: 60, username: 'otheruser', displayname: 'Other User' } },
						user: { uid: 60, username: 'otheruser', displayname: 'Other User' },
					},
				],
			};
			const result = await plugin.onTopicsGet(hookData);

			assert.strictEqual(result.topics[0].user.username, 'Anonymous');
			// Teaser post 202 not in anon set - so user should stay
			assert.strictEqual(result.topics[0].teaser.user.username, 'otheruser');
			anonMainPids.delete(201);
		});
	});

	describe('onTeasersGet (teaser anonymous masking)', () => {
		const anonPids = new Set([301]);

		before(() => {
			plugin._setDb({
				getObjects: async (keys, fields) => keys.map((key) => {
					const pid = parseInt(key.replace('post:', ''), 10);
					return { pid, isAnonymous: anonPids.has(pid) };
				}),
			});
		});

		after(() => {
			plugin._setDb(null);
		});

		it('should mask teaser.user for anonymous teaser when viewer is not privileged', async () => {
			const hookData = {
				uid: 100,
				teasers: [
					{ pid: 301, user: { uid: 70, username: 'teaseruser', displayname: 'Teaser User', userslug: 'teaseruser' } },
				],
			};
			const result = await plugin.onTeasersGet(hookData);

			assert.strictEqual(result.teasers[0].user.username, 'Anonymous');
			assert.strictEqual(result.teasers[0].user.displayname, 'Anonymous');
		});

		it('should NOT mask teaser.user when viewer is privileged', async () => {
			const hookData = {
				uid: 5,
				teasers: [
					{ pid: 301, user: { uid: 70, username: 'teaseruser', displayname: 'Teaser User' } },
				],
			};
			const result = await plugin.onTeasersGet(hookData);

			assert.strictEqual(result.teasers[0].user.username, 'teaseruser');
		});
	});
});

