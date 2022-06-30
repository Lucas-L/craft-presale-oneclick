import { defineStore } from 'pinia'

import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import IconService from 'icon-sdk-js'
import Icx from '@/assets/scripts/hw-app-icx/Icx'

import { useUserStore } from '@/stores/user'

const { iconNetwork } = useRuntimeConfig()
const isTestnet = iconNetwork === 'testnet'
const url = isTestnet ? 'https://sejong.net.solidwallet.io/' : 'https://ctz.solidwallet.io/'
const nid = isTestnet ? '53' : '1'
const provider = new IconService.HttpProvider(`${url}api/v3`)
const iconService = new IconService(provider)

type LedgerStatus = {
  isFetching: boolean
  currentPage: number
  error: string | null
}

type LedgerAddressData = {
  id: number
  address: string
  balance: number
  path: string
  isLoading: boolean
}

type LedgerAddressesList = LedgerAddressData[]

export const useLedgerStore = defineStore('ledger-store', () => {
  const { emit, events } = useEventsBus()
  const { notify } = useNotificationToast()
  const { loginUser } = useUserStore()
  const ITEMS_PER_PAGE = 5 as const

  // States
  const addressPath = ref<string>('')
  const ledgerAddresses = ref<LedgerAddressesList>([])
  const ledgerStatus = reactive<LedgerStatus>({
    isFetching: true,
    currentPage: 0,
    error: '',
  })

  // Actions
  const getLedgerAddresses = async (page: number): Promise<LedgerAddressesList> => {
    try {
      const transport = await TransportWebHID.create()
      const icx = new Icx(transport)

      const ledgerBook: LedgerAddressesList = await Promise.all([...new Array(ITEMS_PER_PAGE)].map(async (_, index) => {
        const id = ITEMS_PER_PAGE * page + index
        const { address } = await icx.getAddress(`44'/4801368'/0'/0'/${id}'`)
        const result = await iconService.getBalance(String(address)).execute()
        const balance = IconService.IconConverter.toNumber(result) / 10 ** 18
        return {
          id,
          address: String(address),
          path: `44'/4801368'/0'/0'/${id}'`,
          balance,
          isLoading: false,
        } as LedgerAddressData
      }))

      return ledgerBook
    } catch (error) {
      throw new Error(error)
    }
  }
  const selectLedgerAddress = async <A extends LedgerAddressData>(address: A['address'], path: A['path']): Promise<void> => {
    const currentLedgerAddress = ledgerAddresses.value.find((ledgerAddress) => ledgerAddress.address === address)
    currentLedgerAddress.isLoading = true

    try {
      addressPath.value = path
      loginUser({ address, wallet: 'ledger' })
      emit(events.POPUP_CLOSE, { handlePending: true })
      notify.success({
        title: 'Log in successful',
        timeout: 5000,
      })
    } catch (error) {
      notify.error({
        title: 'Error',
        message: error,
        timeout: 5000,
      })
    } finally {
      currentLedgerAddress.isLoading = false
    }
  }
  const setLedgerPage = async (page: number): Promise<void> => {
    ledgerStatus.isFetching = true
    ledgerStatus.error = ''

    getLedgerAddresses(page)
      .then((result) => {
        ledgerAddresses.value = result
        ledgerStatus.currentPage = page
      })
      .catch((error) => {
        ledgerStatus.error = error
        notify.error({
          title: 'Error',
          message: error,
          timeout: 5000,
        })
      })
      .finally(() => {
        ledgerStatus.isFetching = false
      })
  }

  return {
    // States
    ledgerAddresses,
    ledgerStatus,

    // Actions
    selectLedgerAddress,
    setLedgerPage,
  }
})
