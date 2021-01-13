import Vue from 'vue';
import { Web3Provider } from '@ethersproject/providers';
import { getInstance } from '@snapshot-labs/lock/plugins/vue';
import networks from '@snapshot-labs/snapshot.js/src/networks.json';
import store from '@/store';
import { formatUnits } from '@ethersproject/units';
import { getProfiles } from '@/helpers/3box';

let wsProvider;
let auth;
const defaultNetwork =
  process.env.VUE_APP_DEFAULT_NETWORK || Object.keys(networks)[0];

if (wsProvider) {
  wsProvider.on('block', blockNumber => {
    store.commit('GET_BLOCK_SUCCESS', blockNumber);
  });
}

const state = {
  account: null,
  name: null,
  network: networks[defaultNetwork]
};

const mutations = {
  HANDLE_CHAIN_CHANGED(_state, chainId) {
    if (!networks[chainId]) {
      networks[chainId] = {
        ...networks[defaultNetwork],
        chainId,
        name: 'Unknown',
        network: 'unknown',
        unknown: true
      };
    }
    Vue.set(_state, 'network', networks[chainId]);
    console.debug('HANDLE_CHAIN_CHANGED', chainId);
  },
  WEB3_SET(_state, payload) {
    Object.keys(payload).forEach(key => {
      Vue.set(_state, key, payload[key]);
    });
  }
};

const actions = {
  login: async ({ dispatch, commit }, connector = 'injected') => {
    auth = getInstance();
    commit('SET', { authLoading: true });
    try {
      await auth.login(connector);
      auth.web3 = new Web3Provider(auth.provider);
      // The Lattice does not have its own provider engine and must overload 
      // certain web3 functions related to address fetching and signing.
      if (connector === 'lattice') {
        auth.web3.send = auth.provider.web3.send;
        auth.web3.getNetwork = auth.provider.web3.getNetwork;
        auth.web3.getSigner = auth.provider.web3.getSigner;
        auth.web3.listAccounts = auth.provider.web3.listAccounts;
      }
      await dispatch('loadProvider');
      commit('SET', { authLoading: false });
    } catch (err) {
      await dispatch('logout');
    }
  },
  logout: async ({ commit }) => {
    Vue.prototype.$auth.logout();
    commit('SET', { authLoading: false });
    commit('WEB3_SET', { account: null, profile: null });
    // Remove the web3 object that may have been added to window.ethereum
    if (window['ethereum'] && window['ethereum']['web3']) {
      window['ethereum']['web3'] = undefined;
    }
  },
  loadProvider: async ({ commit, dispatch }) => {
    try {
      if (auth.provider.removeAllListeners && !auth.provider.isTorus)
        auth.provider.removeAllListeners();
      if (auth.provider.on) {
        auth.provider.on('chainChanged', async chainId => {
          commit('HANDLE_CHAIN_CHANGED', parseInt(formatUnits(chainId, 0)));
        });
        auth.provider.on('accountsChanged', async accounts => {
          if (accounts.length !== 0) {
            commit('WEB3_SET', { account: accounts[0] });
            await dispatch('loadProvider');
          }
        });
        // auth.provider.on('disconnect', async () => {});
      }
      console.log('Provider', auth.provider);
      let network, accounts;
      try {
        [network, accounts] = await Promise.all([
          auth.web3.getNetwork(),
          auth.web3.listAccounts()
        ]);
      } catch (e) {
        console.log(e);
      }
      console.log('Network', network);
      console.log('Accounts', accounts);
      commit('HANDLE_CHAIN_CHANGED', network.chainId);
      const account = accounts.length > 0 ? accounts[0] : null;
      const profiles = await getProfiles([account]);
      commit('WEB3_SET', {
        account,
        profile: profiles[account]
      });
    } catch (e) {
      commit('WEB3_SET', { account: null, profile: null });
      return Promise.reject(e);
    }
  }
};

export default {
  state,
  mutations,
  actions
};
