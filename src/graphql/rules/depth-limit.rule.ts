import { GraphQLError, ValidationContext } from 'graphql';

interface SelectionSetNode {
  selections?: SelectionNode[];
}

interface SelectionNode {
  kind: string;
  selectionSet?: SelectionSetNode;
}

function computeDepth(selectionSet?: SelectionSetNode): number {
  if (!selectionSet?.selections?.length) return 0;
  return Math.max(
    ...selectionSet.selections.map((selection: SelectionNode) => {
      if (selection.kind === 'Field') {
        return 1 + computeDepth(selection.selectionSet);
      }
      if (
        selection.kind === 'InlineFragment' ||
        selection.kind === 'FragmentSpread'
      ) {
        return computeDepth(selection.selectionSet);
      }
      return 0;
    }),
  );
}

export function depthLimitRule(maxDepth: number) {
  return (context: ValidationContext) => ({
    OperationDefinition(node: { selectionSet?: SelectionSetNode }) {
      const depth = computeDepth(node.selectionSet);
      if (depth > maxDepth) {
        context.reportError(
          new GraphQLError(
            `Query depth of ${depth} exceeds the maximum allowed depth of ${maxDepth}. Please reduce query nesting.`,
          ),
        );
      }
    },
  });
}
