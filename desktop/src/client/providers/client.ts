import { FileStorageBackend, Result, ResultError, Return, Store } from "../../lib"
import {
  TAddProviderConfig,
  TConfigureProviderConfig,
  TProviderID,
  TProviderOptions,
  TProviders,
} from "../../types"
import { TDebuggable } from "../types"
import { ProviderCommands } from "./providerCommands"

// WARN: These need to match the rust `file_name` and `dangling_provider_key` constants
// for reliable cleanup!
// Make sure to update them in `src/provider.rs` if you change them here!
const PROVIDERS_STORE_FILE_NAME = "providers"
const PROVIDERS_STORE_DANGLING_PROVIDER_KEY = "danglingProviders"

type TProviderStore = Readonly<{ [PROVIDERS_STORE_DANGLING_PROVIDER_KEY]: readonly TProviderID[] }>

export class ProvidersClient implements TDebuggable {
  private readonly store = new Store<TProviderStore>(
    new FileStorageBackend<TProviderStore>(PROVIDERS_STORE_FILE_NAME)
  )
  private danglingProviderIDs: TProviderID[] = []
  // Queues store operations and guarantees they will be executed in order
  private storeOperationQueue: Promise<unknown> = Promise.resolve()

  constructor() {}

  public setDebug(isEnabled: boolean): void {
    ProviderCommands.DEBUG = isEnabled
  }

  public async listAll(): Promise<Result<TProviders>> {
    return ProviderCommands.ListProviders()
  }

  public async newID(rawSource: string): Promise<Result<string>> {
    return ProviderCommands.GetProviderID(rawSource)
  }

  public async add(rawSource: TProviderID, config: TAddProviderConfig): Promise<ResultError> {
    return ProviderCommands.AddProvider(rawSource, config)
  }

  public async remove(id: TProviderID): Promise<ResultError> {
    return ProviderCommands.RemoveProvider(id)
  }

  public async getOptions(id: TProviderID): Promise<Result<TProviderOptions>> {
    return ProviderCommands.GetProviderOptions(id)
  }

  public async useProvider(id: TProviderID): Promise<ResultError> {
    return ProviderCommands.UseProvider(id)
  }

  public async configure(
    id: TProviderID,
    { useAsDefaultProvider, reuseMachine, options }: TConfigureProviderConfig
  ): Promise<ResultError> {
    const setResult = await ProviderCommands.SetProviderOptions(id, options, reuseMachine)
    if (setResult.err) {
      return setResult
    }

    if (useAsDefaultProvider) {
      return ProviderCommands.UseProvider(id)
    }

    return Return.Ok()
  }

  public setDangling(id: TProviderID): void {
    this.danglingProviderIDs.push(id)
    const ids = this.danglingProviderIDs.slice()
    this.storeOperationQueue = this.storeOperationQueue.then(() =>
      this.store.set("danglingProviders", ids)
    )
  }

  public popDangling(): readonly TProviderID[] {
    const maybeProviderIDs = this.danglingProviderIDs.slice()
    this.danglingProviderIDs.length = 0
    this.storeOperationQueue = this.storeOperationQueue.then(() =>
      this.store.remove("danglingProviders")
    )

    return maybeProviderIDs
  }
}
