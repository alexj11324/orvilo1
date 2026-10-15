import { __esmMin } from "../../../_virtual/_rolldown/runtime.js";
import { $getNodeIdentityPolicy, init_node_identity_policy } from "./node-identity-policy.js";
import { $getEditor, $getRoot, $getState, $isElementNode, $isRootNode, $setState, createState } from "lexical";
//#region src/plugins/common/node/node-id.ts
/** `root` is the document insertion anchor, never a content-node identity. */
function isValidContentNodeId(value) {
	return typeof value === "string" && value.trim().length > 0 && value.trim() !== "root";
}
function $getNodeId(node) {
	const nodeId = $getState(node, nodePropertiesState).nodeId;
	return isValidContentNodeId(nodeId) ? nodeId : void 0;
}
function $setNodeId(node, nodeId) {
	const normalized = nodeId.trim();
	if (!normalized) throw new Error("Node ID must be a non-empty string.");
	if (!isValidContentNodeId(normalized)) throw new Error("Node ID \"root\" is reserved for the document anchor.");
	$setState(node, nodePropertiesState, (properties) => ({
		...properties,
		nodeId: normalized
	}));
}
function $clearNodeId(node) {
	$setState(node, nodePropertiesState, (properties) => {
		const next = { ...properties };
		delete next.nodeId;
		return next;
	});
}
function $copyNodeProperties(source, target) {
	$setState(target, nodePropertiesState, parseProperties($getState(source, nodePropertiesState)));
}
/** Migrate explicit IDs from the legacy serialized `id` field into NodeState. */
function migrateSerializedNodeIds(node) {
	if (!node || typeof node !== "object" || Array.isArray(node)) return;
	const record = node;
	const legacyId = typeof record.id === "string" || typeof record.id === "number" ? String(record.id).trim() : "";
	if (record.type !== "root") {
		const state = record.$ && typeof record.$ === "object" && !Array.isArray(record.$) ? record.$ : {};
		const properties = state.properties && typeof state.properties === "object" && !Array.isArray(state.properties) ? state.properties : {};
		if (!isValidContentNodeId(properties.nodeId) && isValidContentNodeId(legacyId)) record.$ = {
			...state,
			properties: {
				...properties,
				nodeId: legacyId
			}
		};
		else if (!isValidContentNodeId(properties.nodeId) && "nodeId" in properties) {
			const nextProperties = { ...properties };
			delete nextProperties.nodeId;
			const nextState = {
				...state,
				properties: nextProperties
			};
			if (Object.keys(nextProperties).length === 0) delete nextState.properties;
			if (Object.keys(nextState).length === 0) delete record.$;
			else record.$ = nextState;
		}
		if (!isValidContentNodeId(legacyId) && "id" in record) delete record.id;
	}
	if (Array.isArray(record.children)) record.children.forEach(migrateSerializedNodeIds);
}
function hasSameSerializedContent(left, right) {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => hasSameSerializedContent(item, right[index]));
	if (!left || typeof left !== "object" || !right || typeof right !== "object") return false;
	const leftRecord = left;
	const rightRecord = right;
	if (typeof leftRecord.type === "string" && typeof rightRecord.type === "string" && leftRecord.type !== rightRecord.type) return false;
	const getComparableEntries = (record) => {
		const entries = [];
		for (const [key, value] of Object.entries(record)) {
			if (key === "id" && typeof record.type === "string") continue;
			if (key === "$" && value && typeof value === "object" && !Array.isArray(value)) {
				const state = { ...value };
				if (state.properties) {
					state.properties = { ...state.properties };
					delete state.properties.nodeId;
					if (Object.keys(state.properties).length === 0) delete state.properties;
				}
				if (Object.keys(state).length === 0) continue;
				entries.push([key, state]);
			} else entries.push([key, value]);
		}
		return entries;
	};
	const leftEntries = getComparableEntries(leftRecord);
	const rightEntries = getComparableEntries(rightRecord);
	if (leftEntries.length !== rightEntries.length) return false;
	const rightValues = new Map(rightEntries);
	for (const [key, value] of leftEntries) {
		if (!rightValues.has(key)) return false;
		if (!hasSameSerializedContent(value, rightValues.get(key))) return false;
	}
	return true;
}
/** Preserve IDs only when an id-less snapshot node still represents the same subtree. */
function inheritMissingSerializedNodeIds(source, target) {
	if (!source || typeof source !== "object" || Array.isArray(source) || !target || typeof target !== "object" || Array.isArray(target)) return;
	const sourceRecord = source;
	const targetRecord = target;
	if (sourceRecord.type !== targetRecord.type) return;
	const sourceId = serializedNodeId(sourceRecord);
	if (sourceRecord.type !== "root" && sourceId && !serializedNodeId(targetRecord) && hasSameSerializedContent(sourceRecord, targetRecord)) {
		const state = targetRecord.$ && typeof targetRecord.$ === "object" && !Array.isArray(targetRecord.$) ? targetRecord.$ : {};
		const properties = state.properties && typeof state.properties === "object" && !Array.isArray(state.properties) ? state.properties : {};
		targetRecord.$ = {
			...state,
			properties: {
				...properties,
				nodeId: sourceId
			}
		};
	}
	if (Array.isArray(sourceRecord.children) && Array.isArray(targetRecord.children)) {
		const length = Math.min(sourceRecord.children.length, targetRecord.children.length);
		for (let index = 0; index < length; index++) inheritMissingSerializedNodeIds(sourceRecord.children[index], targetRecord.children[index]);
	}
}
function createNodeId() {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
	const cryptoObject = globalThis.crypto;
	const id = [];
	if (typeof cryptoObject?.getRandomValues === "function") {
		while (id.length < 10) {
			const bytes = cryptoObject.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
			for (const byte of bytes) {
				if (byte >= 252) continue;
				id.push(alphabet[byte % 36]);
				if (id.length === 10) break;
			}
		}
		return id.join("");
	}
	for (let index = 0; index < 10; index++) id.push(alphabet[Math.floor(Math.random() * 36)]);
	return id.join("");
}
/** Serialize a subtree without identities so sibling order cannot stand in for identity. */
function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		const record = value;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "undefined";
}
function identityFreeNodeTree(node, cache) {
	const cached = cache.get(node);
	if (cached) return cached;
	const serialized = { ...node.exportJSON() };
	delete serialized.id;
	if (serialized.$?.properties) {
		serialized.$ = {
			...serialized.$,
			properties: { ...serialized.$.properties }
		};
		delete serialized.$.properties.nodeId;
		if (Object.keys(serialized.$.properties).length === 0) delete serialized.$.properties;
		if (Object.keys(serialized.$).length === 0) delete serialized.$;
	}
	if ($isElementNode(node)) serialized.children = node.getChildren().map((child) => identityFreeNodeTree(child, cache));
	cache.set(node, serialized);
	return serialized;
}
/** A stable, opaque repair ID for malformed external snapshots with duplicate IDs. */
function duplicateRepairHashes(sourceId, identity, occurrence) {
	const input = `${sourceId}\u0000${identity}\u0000${occurrence}`;
	const hashes = [
		2166136261,
		2654435769,
		2246822507,
		3266489909
	];
	for (let index = 0; index < input.length; index++) {
		const code = input.charCodeAt(index);
		for (let part = 0; part < hashes.length; part++) hashes[part] = Math.imul(hashes[part] ^ code + part, 16777619);
	}
	return hashes;
}
function duplicateRepairId(sourceId, identity, occurrence) {
	const hashes = duplicateRepairHashes(sourceId, identity, occurrence);
	const partLength = 5;
	const partRange = 36 ** partLength;
	return hashes.slice(0, 2).map((hash) => ((hash >>> 0) % partRange).toString(36).padStart(partLength, "0")).join("");
}
function legacyDuplicateRepairId(sourceId, fingerprint, occurrence) {
	return `dup-${duplicateRepairHashes(sourceId, fingerprint, occurrence).map((hash) => (hash >>> 0).toString(16).padStart(8, "0")).join("")}`;
}
function recordActiveOwners(node, owners, policy) {
	const projection = policy.project(node);
	if (projection === "hidden") return;
	if (projection === "content") {
		const nodeId = $getNodeId(node);
		if (nodeId && !owners.has(nodeId)) owners.set(nodeId, node.getKey());
	}
	if ($isElementNode(node)) {
		if (typeof projection === "object") {
			const selected = node.getChildAtIndex(projection.childIndex);
			if (selected) recordActiveOwners(selected, owners, policy);
		} else node.getChildren().forEach((child) => recordActiveOwners(child, owners, policy));
	}
}
/** Assign identities once per root transform and repair copy/split collisions in one pass. */
function $normalizeNodeIds(root, options = {}) {
	if (!$isRootNode(root)) return;
	const editor = $getEditor();
	const policy = $getNodeIdentityPolicy();
	const previousOwners = /* @__PURE__ */ new Map();
	const previousFingerprints = /* @__PURE__ */ new Map();
	const previousIdsByFingerprint = /* @__PURE__ */ new Map();
	const identityFreeTrees = /* @__PURE__ */ new WeakMap();
	const fingerprintCache = /* @__PURE__ */ new WeakMap();
	const fingerprint = (node) => {
		const cached = fingerprintCache.get(node);
		if (cached) return cached;
		const signature = stableStringify(identityFreeNodeTree(node, identityFreeTrees));
		fingerprintCache.set(node, signature);
		return signature;
	};
	const nodes = [];
	const visit = (node) => {
		if (policy.isIdentityNode(node)) nodes.push(node);
		if ($isElementNode(node)) node.getChildren().forEach(visit);
	};
	root.getChildren().forEach(visit);
	const idGroups = /* @__PURE__ */ new Map();
	const missingIds = [];
	for (const node of nodes) {
		const nodeId = $getNodeId(node);
		if (!nodeId) {
			missingIds.push(node);
			continue;
		}
		const group = idGroups.get(nodeId) || [];
		group.push(node);
		idGroups.set(nodeId, group);
	}
	const duplicateIds = new Set([...idGroups].filter(([, group]) => group.length > 1 && !(group.length === 2 && policy.canShareId(group[0], group[1]))).map(([nodeId]) => nodeId));
	if (!options.stableOwnershipKey) editor.getEditorState().read(() => {
		recordActiveOwners($getRoot(), previousOwners, policy);
		if (options.stableDuplicateRepair && duplicateIds.size > 0) {
			const visit = (node) => {
				if (policy.isIdentityNode(node)) {
					const nodeId = $getNodeId(node);
					if (nodeId) {
						const signature = fingerprint(node);
						if (duplicateIds.has(nodeId)) {
							const signatures = previousFingerprints.get(nodeId) || /* @__PURE__ */ new Set();
							signatures.add(signature);
							previousFingerprints.set(nodeId, signatures);
						}
						const ids = previousIdsByFingerprint.get(signature) || /* @__PURE__ */ new Set();
						ids.add(nodeId);
						previousIdsByFingerprint.set(signature, ids);
					}
				}
				if ($isElementNode(node)) node.getChildren().forEach(visit);
			};
			$getRoot().getChildren().forEach(visit);
		}
	}, { editor });
	const usedIds = new Set(idGroups.keys());
	const reportRepair = (node, nodeId) => {
		const previousId = $getNodeId(node);
		$setNodeId(node, nodeId);
		options.onRepair?.(node, previousId, nodeId);
	};
	const assignFreshId = (node, duplicateSourceId, stableIdentity) => {
		let nodeId;
		if (options.stableDuplicateRepair && duplicateSourceId !== void 0) {
			const identity = stableIdentity ?? fingerprint(node);
			const previousIds = stableIdentity ? void 0 : previousIdsByFingerprint.get(identity);
			const reusableLegacyId = previousIds ? Array.from({ length: previousIds.size + 1 }, (_, index) => legacyDuplicateRepairId(duplicateSourceId, identity, index)).find((candidate) => candidate !== duplicateSourceId && previousIds.has(candidate) && !usedIds.has(candidate)) : void 0;
			let occurrence = 0;
			if (reusableLegacyId) nodeId = reusableLegacyId;
			else do
				nodeId = duplicateRepairId(duplicateSourceId, identity, occurrence++);
			while (usedIds.has(nodeId));
		} else {
			nodeId = createNodeId();
			while (usedIds.has(nodeId)) nodeId = createNodeId();
		}
		reportRepair(node, nodeId);
		usedIds.add(nodeId);
	};
	const assignStableRepairGroup = (nodes, sourceId, identity) => {
		let nodeId;
		let occurrence = 0;
		do
			nodeId = duplicateRepairId(sourceId, identity, occurrence++);
		while (usedIds.has(nodeId));
		nodes.forEach((node) => reportRepair(node, nodeId));
		usedIds.add(nodeId);
	};
	const duplicateGroups = [...idGroups].filter(([nodeId]) => duplicateIds.has(nodeId));
	if (options.stableOwnershipKey) duplicateGroups.sort(([left], [right]) => compareStrings(left, right));
	for (const [nodeId, group] of duplicateGroups) {
		if (group.length < 2) continue;
		if (options.stableOwnershipKey) {
			const identities = group.map((node) => [node, options.stableOwnershipKey(node)]);
			if (identities.some(([, identity]) => !identity)) continue;
			const identityKeys = identities.map(([, identity]) => identity);
			if (new Set(identityKeys).size !== identityKeys.length) continue;
			const identityByNode = new Map(identities);
			const reviewPairs = [];
			for (let leftIndex = 0; leftIndex < group.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex++) if (policy.canShareId(group[leftIndex], group[rightIndex])) reviewPairs.push([group[leftIndex], group[rightIndex]]);
			const preserved = /* @__PURE__ */ new Set();
			const pairedNodes = /* @__PURE__ */ new Set();
			const matchedPairs = [];
			if (reviewPairs.length > 0) {
				const sortedPairs = reviewPairs.map(([left, right]) => compareStrings(identityByNode.get(left), identityByNode.get(right)) <= 0 ? [left, right] : [right, left]).sort((left, right) => {
					const leftKey = left.map((node) => identityByNode.get(node)).join("\0");
					const rightKey = right.map((node) => identityByNode.get(node)).join("\0");
					return compareStrings(leftKey, rightKey);
				});
				const matchedNodes = /* @__PURE__ */ new Set();
				for (const [left, right] of sortedPairs) {
					if (matchedNodes.has(left) || matchedNodes.has(right)) continue;
					matchedNodes.add(left);
					matchedNodes.add(right);
					pairedNodes.add(left);
					pairedNodes.add(right);
					matchedPairs.push([left, right]);
				}
				const primaryPair = matchedPairs[0];
				if (primaryPair) {
					preserved.add(primaryPair[0]);
					preserved.add(primaryPair[1]);
				}
			} else {
				const primary = [...group].sort((left, right) => compareStrings(identityByNode.get(left), identityByNode.get(right)))[0];
				preserved.add(primary);
			}
			const losingPairs = matchedPairs.slice(1);
			const losingNodes = group.filter((node) => !preserved.has(node) && !pairedNodes.has(node)).sort((left, right) => compareStrings(identityByNode.get(left), identityByNode.get(right)));
			const repairGroups = [...losingPairs.map(([left, right]) => [left, right]), ...losingNodes.map((node) => [node])].sort((left, right) => compareStrings(left.map((node) => identityByNode.get(node)).sort(compareStrings).join("\0"), right.map((node) => identityByNode.get(node)).sort(compareStrings).join("\0")));
			for (const repairGroup of repairGroups) assignStableRepairGroup(repairGroup, nodeId, repairGroup.map((node) => identityByNode.get(node)).sort(compareStrings).join("\0"));
			continue;
		}
		const previousOwner = group.find((node) => node.getKey() === previousOwners.get(nodeId));
		const matchingPreviousOwner = options.stableDuplicateRepair ? group.find((node) => previousFingerprints.get(nodeId)?.has(fingerprint(node))) : void 0;
		const notPreviouslyRepaired = options.stableDuplicateRepair ? group.find((node) => {
			const signature = fingerprint(node);
			const priorIds = previousIdsByFingerprint.get(signature);
			if (!priorIds) return true;
			for (let occurrence = 0; occurrence <= priorIds.size; occurrence++) {
				const repairId = duplicateRepairId(nodeId, signature, occurrence);
				if (repairId !== nodeId && priorIds.has(repairId)) return false;
			}
			return true;
		}) : void 0;
		const primary = previousOwner || matchingPreviousOwner || notPreviouslyRepaired || group[0];
		const reviewCounterpart = group.find((node) => node !== primary && policy.canShareId(primary, node));
		const preserved = /* @__PURE__ */ new Set([primary, ...reviewCounterpart ? [reviewCounterpart] : []]);
		for (const node of group) if (!preserved.has(node)) assignFreshId(node, nodeId);
	}
	for (const node of missingIds) if (options.stableOwnershipKey && options.stableDuplicateRepair) {
		const identity = options.stableOwnershipKey(node);
		if (!identity) continue;
		assignFreshId(node, "", identity);
	} else assignFreshId(node);
}
function editorStateHasCompleteNodeIds(editorState, editor) {
	let nodeCount = 0;
	let complete = true;
	editorState.read(() => {
		const policy = $getNodeIdentityPolicy();
		const visit = (node) => {
			if (policy.isIdentityNode(node)) {
				nodeCount += 1;
				if (!$getNodeId(node)) complete = false;
			}
			if ($isElementNode(node)) node.getChildren().forEach(visit);
		};
		visit($getRoot());
	}, { editor });
	return nodeCount > 0 && complete;
}
/** Ensure newly imported nodes can be addressed before the enclosing update commits. */
function $ensureUniqueNodeIds(nodes) {
	const policy = $getNodeIdentityPolicy();
	const usedIds = /* @__PURE__ */ new Set();
	const collectExisting = (node) => {
		const nodeId = $getNodeId(node);
		if (nodeId) usedIds.add(nodeId);
		if ($isElementNode(node)) node.getChildren().forEach(collectExisting);
	};
	collectExisting($getRoot());
	const ensureNode = (node) => {
		if (!policy.isIdentityNode(node)) {
			if ($isElementNode(node)) node.getChildren().forEach(ensureNode);
			return;
		}
		let nodeId = $getNodeId(node);
		if (!nodeId || usedIds.has(nodeId)) {
			do
				nodeId = createNodeId();
			while (usedIds.has(nodeId));
			$setNodeId(node, nodeId);
		}
		usedIds.add(nodeId);
		if ($isElementNode(node)) node.getChildren().forEach(ensureNode);
	};
	nodes.forEach(ensureNode);
}
/** Find the active representation of a logical ID in a Lexical read/update context. */
function $getNodeById(nodeId, root) {
	if (!isValidContentNodeId(nodeId)) return null;
	const policy = $getNodeIdentityPolicy();
	const start = root ?? $getRoot();
	const visit = (node) => {
		if (!$isElementNode(node)) return $getNodeId(node) === nodeId && policy.project(node) === "content" ? node : null;
		const projection = policy.project(node);
		if (projection === "hidden") return null;
		if (projection === "content" && $getNodeId(node) === nodeId) return node;
		if (typeof projection === "object") {
			const selected = node.getChildAtIndex(projection.childIndex);
			return selected ? visit(selected) : null;
		}
		for (const child of node.getChildren()) {
			const found = visit(child);
			if (found) return found;
		}
		return null;
	};
	return visit(start);
}
/** Build a key-only index for one immutable editor state; never cache LexicalNode objects. */
function $getActiveNodeIdKeys() {
	const policy = $getNodeIdentityPolicy();
	const keys = /* @__PURE__ */ new Map();
	const visit = (node) => {
		const projection = policy.project(node);
		if (projection === "hidden") return;
		if (projection === "content") {
			const id = $getNodeId(node);
			if (id && !keys.has(id)) keys.set(id, node.getKey());
		}
		if ($isElementNode(node)) {
			if (typeof projection === "object") {
				const selected = node.getChildAtIndex(projection.childIndex);
				if (selected) visit(selected);
			} else node.getChildren().forEach(visit);
		}
	};
	visit($getRoot());
	return keys;
}
var cloneProperties, parseProperties, isEqual, compareStrings, nodePropertiesState, serializedNodeId, $findNodeById;
var init_node_id = __esmMin((() => {
	init_node_identity_policy();
	cloneProperties = (value) => {
		if (typeof structuredClone === "function") try {
			return structuredClone(value);
		} catch {}
		return JSON.parse(JSON.stringify(value));
	};
	parseProperties = (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		const properties = cloneProperties(value);
		const nodeId = properties.nodeId;
		if (isValidContentNodeId(nodeId)) properties.nodeId = nodeId.trim();
		else delete properties.nodeId;
		return properties;
	};
	isEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
	compareStrings = (left, right) => left < right ? -1 : left > right ? 1 : 0;
	nodePropertiesState = createState("properties", {
		isEqual,
		unparse: cloneProperties,
		parse: parseProperties
	});
	serializedNodeId = (node) => {
		const nodeId = node.$?.properties?.nodeId;
		if (isValidContentNodeId(nodeId)) return nodeId.trim();
		if (typeof node.id === "string" || typeof node.id === "number") {
			const legacyId = String(node.id).trim();
			return isValidContentNodeId(legacyId) ? legacyId : void 0;
		}
	};
	$findNodeById = $getNodeById;
}));
//#endregion
init_node_id();
export { $clearNodeId, $copyNodeProperties, $ensureUniqueNodeIds, $findNodeById, $getActiveNodeIdKeys, $getNodeById, $getNodeId, $normalizeNodeIds, $setNodeId, editorStateHasCompleteNodeIds, inheritMissingSerializedNodeIds, init_node_id, isValidContentNodeId, migrateSerializedNodeIds, nodePropertiesState };
