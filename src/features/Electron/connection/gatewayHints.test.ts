import {describe,expect,it} from 'vitest';
import {resolveGatewayHints} from './gatewayHints';
const base = {connectionCount:0,connectionState:'disconnected' as const,isConnected:true,isConnecting:false};
describe('device gateway hints',()=>{
  it('keeps the native connected dot when the inventory has not caught up',()=>{
    expect(resolveGatewayHints(base)).toEqual({connection:{key:'gateway.statusConnectedConnections',count:1},showConnectedDot:true});
  });
  it('counts every owned connection when this desktop is disconnected',()=>{
    expect(resolveGatewayHints({...base,isConnected:false,connectionState:'connected',connectionCount:2})).toEqual({connection:{key:'gateway.statusConnectedConnections',count:2},showConnectedDot:true});
  });
  it('distinguishes failed and loading inventory from offline devices',()=>{
    expect(resolveGatewayHints({...base,isConnected:false,connectionState:'unavailable'}).connection.key).toBe('gateway.statusUnavailable');
    expect(resolveGatewayHints({...base,isConnected:false,connectionState:'connecting'}).connection.key).toBe('gateway.statusLoading');
    expect(resolveGatewayHints({...base,isConnected:false}).showConnectedDot).toBe(false);
  });
});
