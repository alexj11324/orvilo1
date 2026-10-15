import { __esmMin } from "../../../_virtual/_rolldown/runtime.js";
import { $getEditor, $isRootNode } from "lexical";
//#region src/plugins/common/node/node-identity-policy.ts
function subscribeNodeIdentityPolicy(editor, listener) {
	const listeners = policyListeners.get(editor) || /* @__PURE__ */ new Set();
	listeners.add(listener);
	policyListeners.set(editor, listeners);
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		listeners.delete(listener);
		if (listeners.size === 0 && policyListeners.get(editor) === listeners) policyListeners.delete(editor);
	};
}
function getNodeIdentityPolicyRevision(editor) {
	return policyRevisions.get(editor) || 0;
}
function bumpPolicyRevision(editor) {
	policyRevisions.set(editor, getNodeIdentityPolicyRevision(editor) + 1);
	const listeners = Array.from(policyListeners.get(editor) || []);
	for (const listener of listeners) listener();
}
/** Register a document-format policy for one editor, with order-independent disposal. */
function registerNodeIdentityPolicy(editor, policy) {
	const entry = { policy };
	const registrations = editorPolicies.get(editor) || [];
	registrations.push(entry);
	editorPolicies.set(editor, registrations);
	bumpPolicyRevision(editor);
	return () => {
		const current = editorPolicies.get(editor);
		if (!current) return;
		const index = current.indexOf(entry);
		if (index >= 0) {
			current.splice(index, 1);
			bumpPolicyRevision(editor);
		}
		if (current.length === 0) editorPolicies.delete(editor);
	};
}
/**
* Requires an editor-bound Lexical context. For an EditorState snapshot, pass
* `{ editor }` to `state.read` so its document policy is unambiguous.
*/
function $getNodeIdentityPolicy() {
	let editor;
	try {
		editor = $getEditor();
	} catch {
		throw new Error("Node ID access requires editor.read/update or state.read(callback, { editor }).");
	}
	return editorPolicies.get(editor)?.at(-1)?.policy || defaultPolicy;
}
var defaultPolicy, editorPolicies, policyRevisions, policyListeners;
var init_node_identity_policy = __esmMin((() => {
	defaultPolicy = {
		canShareId: () => false,
		isIdentityNode: (node) => !$isRootNode(node),
		project: (node) => $isRootNode(node) ? "container" : "content"
	};
	editorPolicies = /* @__PURE__ */ new WeakMap();
	policyRevisions = /* @__PURE__ */ new WeakMap();
	policyListeners = /* @__PURE__ */ new WeakMap();
}));
//#endregion
init_node_identity_policy();
export { $getNodeIdentityPolicy, getNodeIdentityPolicyRevision, init_node_identity_policy, registerNodeIdentityPolicy, subscribeNodeIdentityPolicy };
