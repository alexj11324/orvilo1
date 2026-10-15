import { IServiceID } from "../../../types/kernel.js";
import "../../../types/index.js";
//#region src/plugins/common/service/i-node-identity-service.d.ts
/** A detached, immutable description of the currently active logical node. */
interface NodeIdentitySnapshot {
  readonly id: string;
  /** Native Lexical text; a review container can include both pending sides. */
  readonly textContent: string;
  readonly type: string;
}
interface INodeIdentityService {
  /** Read the last committed editor state without retaining a LexicalNode. */
  getNodeById(nodeId: string): Readonly<NodeIdentitySnapshot> | null;
  /** Subscribe to committed updates; query the service in the callback. */
  subscribe(listener: () => void): () => void;
}
declare const INodeIdentityService: IServiceID<INodeIdentityService>;
//#endregion
export { INodeIdentityService, NodeIdentitySnapshot };