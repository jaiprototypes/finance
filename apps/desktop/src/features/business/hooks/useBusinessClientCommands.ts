import type { Dispatch, SetStateAction } from "react";
import { removeFeatureRecord, sendFeatureCommand } from "../api";

type ClientForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

type BusinessClientCommandsArgs = {
  clientForm: ClientForm;
  editingClientId: number | null;
  refresh: () => void | Promise<unknown>;
  setClientError: (message: string | null) => void;
  setClientForm: Dispatch<SetStateAction<ClientForm>>;
  setClientNotice: (message: string | null) => void;
  setClientToolOpenToken: Dispatch<SetStateAction<number>>;
  setEditingClientId: Dispatch<SetStateAction<number | null>>;
  setExpandedClientId: Dispatch<SetStateAction<number | null>>;
};

const buildEmptyClientForm = (): ClientForm => ({
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: ""
});

export function useBusinessClientCommands({
  clientForm,
  editingClientId,
  refresh,
  setClientError,
  setClientForm,
  setClientNotice,
  setClientToolOpenToken,
  setEditingClientId,
  setExpandedClientId
}: BusinessClientCommandsArgs) {
  const resetClientForm = () => {
    setEditingClientId(null);
    setClientForm(buildEmptyClientForm());
  };

  const openClientCreator = () => {
    setClientError(null);
    setClientNotice(null);
    resetClientForm();
    setClientToolOpenToken((prev) => prev + 1);
  };

  const saveClient = async () => {
    setClientError(null);
    setClientNotice(null);
    const name = clientForm.name.trim();
    if (!name) {
      setClientError("Client name is required.");
      return;
    }
    if (editingClientId) {
      try {
        await sendFeatureCommand(`/business/clients/${editingClientId}`, { ...clientForm, name, is_active: true });
      } catch (err) {
        setClientError(err instanceof Error ? err.message : "Unable to save client.");
        return;
      }
    } else {
      try {
        await sendFeatureCommand("/business/clients", { ...clientForm, name });
      } catch (err) {
        setClientError(err instanceof Error ? err.message : "Unable to add client.");
        return;
      }
    }
    resetClientForm();
    refresh();
  };

  const startEditClient = (client: any) => {
    setClientError(null);
    setClientNotice(null);
    setEditingClientId(client.id);
    setClientForm({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || ""
    });
  };

  const deleteClient = async (clientId: number) => {
    setClientError(null);
    setClientNotice(null);
    try {
      const result = await removeFeatureRecord<{ status: string }>(`/business/clients/${clientId}`);
      if (editingClientId === clientId) {
        resetClientForm();
      }
      setExpandedClientId((current) => (current === clientId ? null : current));
      setClientNotice(
        result.status === "deleted"
          ? "Client deleted."
          : "Client archived because it still has linked invoices, history, or projects."
      );
      refresh();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Unable to delete client.");
    }
  };

  const restoreClient = async (client: any) => {
    setClientError(null);
    setClientNotice(null);
    try {
      await sendFeatureCommand(`/business/clients/${client.id}`, {
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        notes: client.notes,
        is_active: true
      });
      setClientNotice("Client restored.");
      refresh();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Unable to restore client.");
    }
  };

  return {
    deleteClient,
    openClientCreator,
    resetClientForm,
    restoreClient,
    saveClient,
    startEditClient
  };
}
