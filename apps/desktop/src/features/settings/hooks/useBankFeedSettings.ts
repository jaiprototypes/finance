import { useEffect, useState } from "react";
import { getFeatureData, sendFeatureCommand } from "../api";
import {
  PLAID_REFRESH_EVENT_KEY,
  clearPendingPlaidLinkSession,
  formatPlaidLinkExitError,
  loadPlaidScript,
  notifyPlaidRefresh,
  savePendingPlaidLinkSession
} from "../../../shared/financeUi";

export function useBankFeedSettings() {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [plaidStatus, setPlaidStatus] = useState<any | null>(null);
  const [plaidItems, setPlaidItems] = useState<any[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<any[]>([]);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidSync, setPlaidSync] = useState<any | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidLinkBusy, setPlaidLinkBusy] = useState(false);
  const [upStatus, setUpStatus] = useState<any | null>(null);
  const [upAccounts, setUpAccounts] = useState<any[]>([]);
  const [upError, setUpError] = useState<string | null>(null);
  const [upSync, setUpSync] = useState<any | null>(null);
  const [upBusy, setUpBusy] = useState(false);

  const refreshConnectors = () => {
    getFeatureData<any[]>("/connectors").then(setConnectors).catch(() => setConnectors([]));
  };

  const refreshPlaid = () => {
    getFeatureData<any>("/plaid/status")
      .then(setPlaidStatus)
      .catch(() => setPlaidStatus({ configured: false, items: 0 }));
    getFeatureData<any[]>("/plaid/items").then(setPlaidItems).catch(() => setPlaidItems([]));
    getFeatureData<any[]>("/plaid/accounts").then(setPlaidAccounts).catch(() => setPlaidAccounts([]));
  };

  const refreshUp = () => {
    getFeatureData<any>("/up/status")
      .then(setUpStatus)
      .catch(() => setUpStatus({ configured: false, accounts: 0 }));
    getFeatureData<any[]>("/up/accounts").then(setUpAccounts).catch(() => setUpAccounts([]));
  };

  const connectPlaid = async () => {
    setPlaidError(null);
    setPlaidLinkBusy(true);
    try {
      await loadPlaidScript();
      const tokenResponse = await sendFeatureCommand<any>("/plaid/link-token");
      savePendingPlaidLinkSession({ token: tokenResponse.link_token, mode: "connect" });
      const handler = window.Plaid.create({
        token: tokenResponse.link_token,
        onSuccess: async (publicToken: string, metadata: any) => {
          try {
            await sendFeatureCommand("/plaid/exchange", { public_token: publicToken, metadata });
            clearPendingPlaidLinkSession();
            notifyPlaidRefresh();
            refreshPlaid();
          } catch (err) {
            setPlaidError(err instanceof Error ? err.message : "Unable to exchange Plaid token.");
          } finally {
            setPlaidLinkBusy(false);
          }
        },
        onExit: (err: any) => {
          if (err) {
            setPlaidError(formatPlaidLinkExitError(err));
          } else {
            clearPendingPlaidLinkSession();
          }
          setPlaidLinkBusy(false);
        }
      });
      handler.open();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Unable to start Plaid Link.");
      setPlaidLinkBusy(false);
    }
  };

  const updatePlaidItem = async (itemId: string) => {
    setPlaidError(null);
    setPlaidLinkBusy(true);
    try {
      await loadPlaidScript();
      const tokenResponse = await sendFeatureCommand<any>("/plaid/link-token/update", { item_id: itemId });
      savePendingPlaidLinkSession({ token: tokenResponse.link_token, mode: "update", itemId });
      const handler = window.Plaid.create({
        token: tokenResponse.link_token,
        onSuccess: async () => {
          try {
            const result = await sendFeatureCommand<any>("/plaid/sync");
            clearPendingPlaidLinkSession();
            notifyPlaidRefresh();
            setPlaidSync(result);
            refreshPlaid();
          } catch (err) {
            setPlaidError(err instanceof Error ? err.message : "Unable to sync Plaid accounts after update.");
          } finally {
            setPlaidLinkBusy(false);
          }
        },
        onExit: (err: any) => {
          if (err) {
            setPlaidError(formatPlaidLinkExitError(err));
          } else {
            clearPendingPlaidLinkSession();
          }
          setPlaidLinkBusy(false);
        }
      });
      handler.open();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Unable to start Plaid update mode.");
      setPlaidLinkBusy(false);
    }
  };

  const syncPlaid = async () => {
    setPlaidError(null);
    setPlaidBusy(true);
    try {
      const result = await sendFeatureCommand<any>("/plaid/sync");
      setPlaidSync(result);
      refreshPlaid();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Plaid sync failed.");
    } finally {
      setPlaidBusy(false);
    }
  };

  const syncUp = async () => {
    setUpError(null);
    setUpBusy(true);
    try {
      const result = await sendFeatureCommand<any>("/up/sync");
      setUpSync(result);
      refreshUp();
    } catch (err) {
      setUpError(err instanceof Error ? err.message : "Up Bank sync failed.");
    } finally {
      setUpBusy(false);
    }
  };

  const plaidItemNeedsLogin = (item: any) =>
    item?.status === "login_required" ||
    (Array.isArray(plaidSync?.errors) &&
      plaidSync.errors.some(
        (error: any) => error?.item_id === item?.item_id && error?.error_code === "ITEM_LOGIN_REQUIRED"
      ));

  useEffect(() => {
    const handlePlaidRefresh = (event: StorageEvent) => {
      if (event.key === PLAID_REFRESH_EVENT_KEY) {
        refreshPlaid();
      }
    };
    window.addEventListener("storage", handlePlaidRefresh);
    return () => window.removeEventListener("storage", handlePlaidRefresh);
  }, []);

  useEffect(() => {
    refreshConnectors();
    refreshPlaid();
    refreshUp();
  }, []);

  return {
    connectPlaid,
    connectors,
    plaidAccounts,
    plaidBusy,
    plaidError,
    plaidItemNeedsLogin,
    plaidItems,
    plaidLinkBusy,
    plaidStatus,
    plaidSync,
    syncPlaid,
    syncUp,
    updatePlaidItem,
    upAccounts,
    upBusy,
    upError,
    upStatus,
    upSync
  };
}
