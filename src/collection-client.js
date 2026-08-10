import { connect } from '../collection.js';

// Simple collection client wrapper
export function createCollection(onConnected) {
    return connect({ onConnected });
}

// convenience init that stores and returns the collection
export function initCollection(getOnConnected) {
    const coll = createCollection(getOnConnected());
    return coll;
}
