var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { VendureEntity } from "@vendure/core";
import { Column, Entity } from "typeorm";
let ProductDefinition = (() => {
    let _classDecorators = [Entity()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = VendureEntity;
    let _productId_decorators;
    let _productId_initializers = [];
    let _productId_extraInitializers = [];
    let _definition_decorators;
    let _definition_initializers = [];
    let _definition_extraInitializers = [];
    let _nativeProductId_decorators;
    let _nativeProductId_initializers = [];
    let _nativeProductId_extraInitializers = [];
    let _syncedDefinitionHash_decorators;
    let _syncedDefinitionHash_initializers = [];
    let _syncedDefinitionHash_extraInitializers = [];
    let _syncedNativeStateHash_decorators;
    let _syncedNativeStateHash_initializers = [];
    let _syncedNativeStateHash_extraInitializers = [];
    let _syncState_decorators;
    let _syncState_initializers = [];
    let _syncState_extraInitializers = [];
    let _syncError_decorators;
    let _syncError_initializers = [];
    let _syncError_extraInitializers = [];
    var ProductDefinition = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _productId_decorators = [Column({ type: "varchar", unique: true })];
            _definition_decorators = [Column({ type: "jsonb" })];
            _nativeProductId_decorators = [Column({ type: "integer", nullable: true })];
            _syncedDefinitionHash_decorators = [Column({ type: "varchar", nullable: true })];
            _syncedNativeStateHash_decorators = [Column({ type: "varchar", nullable: true })];
            _syncState_decorators = [Column({ type: "varchar", default: "synced" })];
            _syncError_decorators = [Column({ type: "text", nullable: true })];
            __esDecorate(null, null, _productId_decorators, { kind: "field", name: "productId", static: false, private: false, access: { has: obj => "productId" in obj, get: obj => obj.productId, set: (obj, value) => { obj.productId = value; } }, metadata: _metadata }, _productId_initializers, _productId_extraInitializers);
            __esDecorate(null, null, _definition_decorators, { kind: "field", name: "definition", static: false, private: false, access: { has: obj => "definition" in obj, get: obj => obj.definition, set: (obj, value) => { obj.definition = value; } }, metadata: _metadata }, _definition_initializers, _definition_extraInitializers);
            __esDecorate(null, null, _nativeProductId_decorators, { kind: "field", name: "nativeProductId", static: false, private: false, access: { has: obj => "nativeProductId" in obj, get: obj => obj.nativeProductId, set: (obj, value) => { obj.nativeProductId = value; } }, metadata: _metadata }, _nativeProductId_initializers, _nativeProductId_extraInitializers);
            __esDecorate(null, null, _syncedDefinitionHash_decorators, { kind: "field", name: "syncedDefinitionHash", static: false, private: false, access: { has: obj => "syncedDefinitionHash" in obj, get: obj => obj.syncedDefinitionHash, set: (obj, value) => { obj.syncedDefinitionHash = value; } }, metadata: _metadata }, _syncedDefinitionHash_initializers, _syncedDefinitionHash_extraInitializers);
            __esDecorate(null, null, _syncedNativeStateHash_decorators, { kind: "field", name: "syncedNativeStateHash", static: false, private: false, access: { has: obj => "syncedNativeStateHash" in obj, get: obj => obj.syncedNativeStateHash, set: (obj, value) => { obj.syncedNativeStateHash = value; } }, metadata: _metadata }, _syncedNativeStateHash_initializers, _syncedNativeStateHash_extraInitializers);
            __esDecorate(null, null, _syncState_decorators, { kind: "field", name: "syncState", static: false, private: false, access: { has: obj => "syncState" in obj, get: obj => obj.syncState, set: (obj, value) => { obj.syncState = value; } }, metadata: _metadata }, _syncState_initializers, _syncState_extraInitializers);
            __esDecorate(null, null, _syncError_decorators, { kind: "field", name: "syncError", static: false, private: false, access: { has: obj => "syncError" in obj, get: obj => obj.syncError, set: (obj, value) => { obj.syncError = value; } }, metadata: _metadata }, _syncError_initializers, _syncError_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProductDefinition = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
        constructor(input) {
            super(input);
        }
        /** The canonical product id (`ProductIdSchema`) — the business key. */
        productId = __runInitializers(this, _productId_initializers, void 0);
        /** The write-time-validated canonical definition. */
        definition = (__runInitializers(this, _productId_extraInitializers), __runInitializers(this, _definition_initializers, void 0));
        /** The native Vendure Product the sync generated for this definition. */
        nativeProductId = (__runInitializers(this, _definition_extraInitializers), __runInitializers(this, _nativeProductId_initializers, void 0));
        /** Hash of the definition state the last successful sync derived. */
        syncedDefinitionHash = (__runInitializers(this, _nativeProductId_extraInitializers), __runInitializers(this, _syncedDefinitionHash_initializers, void 0));
        /** Hash of the native option-group/variant state the last sync produced. */
        syncedNativeStateHash = (__runInitializers(this, _syncedDefinitionHash_extraInitializers), __runInitializers(this, _syncedNativeStateHash_initializers, void 0));
        /** The queued/failed/done state of the definition→native sync. The default
         * only exists for the migration's backfill; every write sets it explicitly. */
        syncState = (__runInitializers(this, _syncedNativeStateHash_extraInitializers), __runInitializers(this, _syncState_initializers, void 0));
        /** Why the last sync attempt failed, for the dashboard's status display. */
        syncError = (__runInitializers(this, _syncState_extraInitializers), __runInitializers(this, _syncError_initializers, void 0));
        /** The native product's hu name, filled at read time by the service (ADR
         * 0011 decision 1: the native Product owns the name) — a projection, never
         * persisted. */
        label = __runInitializers(this, _syncError_extraInitializers);
    };
    return ProductDefinition = _classThis;
})();
export { ProductDefinition };
