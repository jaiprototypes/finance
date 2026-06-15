import { useEffect, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "../api";

export function useAutomationSettings() {
  const [rules, setRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    field: "description",
    operator: "contains",
    value: "",
    category_id: "",
    is_active: true
  });
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: "",
    content: "",
    tags: "",
    is_active: true
  });

  const refreshRules = () => {
    getFeatureData<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const refreshKnowledge = () => {
    getFeatureData<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const createRule = async () => {
    await sendFeatureCommand("/rules", {
      name: ruleForm.name,
      field: ruleForm.field,
      operator: ruleForm.operator,
      value: ruleForm.value,
      category_id: ruleForm.category_id ? Number(ruleForm.category_id) : null,
      is_active: ruleForm.is_active
    });
    setRuleForm({ name: "", field: "description", operator: "contains", value: "", category_id: "", is_active: true });
    refreshRules();
  };

  const toggleRule = async (rule: any) => {
    await sendFeatureCommand(`/rules/${rule.id}`, {
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      category_id: rule.category_id,
      payee: rule.payee,
      memo_contains: rule.memo_contains,
      is_active: !rule.is_active
    });
    refreshRules();
  };

  const deleteRule = async (ruleId: number) => {
    await removeFeatureRecord(`/rules/${ruleId}`);
    refreshRules();
  };

  const createKnowledge = async () => {
    await sendFeatureCommand("/knowledge", {
      title: knowledgeForm.title,
      content: knowledgeForm.content,
      tags: knowledgeForm.tags || undefined,
      is_active: knowledgeForm.is_active
    });
    setKnowledgeForm({ title: "", content: "", tags: "", is_active: true });
    refreshKnowledge();
  };

  const toggleKnowledge = async (entry: any) => {
    await sendFeatureCommand(`/knowledge/${entry.id}`, {
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      is_active: !entry.is_active
    });
    refreshKnowledge();
  };

  const deleteKnowledge = async (entryId: number) => {
    await removeFeatureRecord(`/knowledge/${entryId}`);
    refreshKnowledge();
  };

  useEffect(() => {
    refreshRules();
    refreshKnowledge();
  }, []);

  return {
    activeKnowledgeCount: knowledge.filter((entry) => entry.is_active).length,
    activeRuleCount: rules.filter((rule) => rule.is_active).length,
    createKnowledge,
    createRule,
    deleteKnowledge,
    deleteRule,
    knowledge,
    knowledgeForm,
    ruleForm,
    rules,
    setKnowledgeForm,
    setRuleForm,
    toggleKnowledge,
    toggleRule
  };
}
