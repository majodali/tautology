// Main serializer
export { ProxySerializer, type SerializerConfig, type SerializeResult, DEFAULT_SERIALIZER_CONFIG } from './serializer.js';

// Serialization queue
export { SerializationQueue } from './queue.js';

// Size estimation
export { estimateSize } from './size-estimator.js';

// Deep serialization
export {
  deepSerialize,
  createSerializeContext,
  type DeepSerializeConfig,
  type SerializeContext,
  DEFAULT_DEEP_SERIALIZE_CONFIG,
} from './deep-serialize.js';

// Proxy tracking
export {
  createTrackedProxy,
  getTrackingData,
  createTrackingData,
  type TrackingData,
} from './proxy-tracker.js';

// Type handlers
export {
  registerTypeHandler,
  findHandler,
  findHandlerByTag,
  getTypeTag,
  type TypeHandler,
} from './type-handlers.js';
