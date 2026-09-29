import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const ifNodeConfigSchema = z.object({
  conditions: z
    .array(
      z.object({
        left: z.unknown().optional(),
        operator: z
          .enum([
            'equals',
            'notEquals',
            'contains',
            'notContains',
            'startsWith',
            'endsWith',
            'gt',
            'gte',
            'lt',
            'lte',
            'isEmpty',
            'isNotEmpty',
          ])
          .default('equals'),
        right: z.unknown().optional(),
      })
    )
    .default([]),
  combinator: z.enum(['AND', 'OR']).default('AND'),
});

export type IfNodeConfig = z.infer<typeof ifNodeConfigSchema>;

export const ifNode: NodeDefinition<IfNodeConfig> = {
  type: 'logic.if',
  version: 1,
  name: 'IF Condition',
  description:
    'Splits items into true and false output branches based on configurable conditional rules.',
  category: 'LOGIC',
  icon: 'git-branch',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [
    { id: 'true', label: 'True' },
    { id: 'false', label: 'False' },
  ],
  mode: 'perItem',
  fields: [
    {
      name: 'conditions',
      label: 'Conditions',
      type: 'conditions',
      default: [],
    },
    {
      name: 'combinator',
      label: 'Combinator',
      type: 'select',
      default: 'AND',
      options: [
        { label: 'AND (All rules must match)', value: 'AND' },
        { label: 'OR (Any rule may match)', value: 'OR' },
      ],
    },
  ],
  configSchema: ifNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (_ctx: NodeContext, items: Item[], config: IfNodeConfig): Promise<NodeResult> => {
    const trueItems: Item[] = [];
    const falseItems: Item[] = [];

    for (const item of items) {
      if (config.conditions.length === 0) {
        trueItems.push(item);
        continue;
      }

      const results = config.conditions.map((rule) => {
        const leftVal = rule.left !== undefined ? rule.left : item.json;
        const rightVal = rule.right;

        switch (rule.operator) {
          case 'equals':
            return String(leftVal ?? '') === String(rightVal ?? '');
          case 'notEquals':
            return String(leftVal ?? '') !== String(rightVal ?? '');
          case 'contains':
            return String(leftVal ?? '').includes(String(rightVal ?? ''));
          case 'notContains':
            return !String(leftVal ?? '').includes(String(rightVal ?? ''));
          case 'startsWith':
            return String(leftVal ?? '').startsWith(String(rightVal ?? ''));
          case 'endsWith':
            return String(leftVal ?? '').endsWith(String(rightVal ?? ''));
          case 'gt':
            return Number(leftVal) > Number(rightVal);
          case 'gte':
            return Number(leftVal) >= Number(rightVal);
          case 'lt':
            return Number(leftVal) < Number(rightVal);
          case 'lte':
            return Number(leftVal) <= Number(rightVal);
          case 'isEmpty':
            return leftVal === null || leftVal === undefined || leftVal === '';
          case 'isNotEmpty':
            return leftVal !== null && leftVal !== undefined && leftVal !== '';
          default:
            return false;
        }
      });

      const isMatch = config.combinator === 'OR' ? results.some((r) => r) : results.every((r) => r);

      if (isMatch) {
        trueItems.push(item);
      } else {
        falseItems.push(item);
      }
    }

    return {
      outputs: {
        true: trueItems,
        false: falseItems,
      },
    };
  },
};
