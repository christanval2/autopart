import { useMemo } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { cn } from '@autoparts/utils';
import type { Category, CategoryNode } from '@autoparts/types';

/** Construit l'arborescence depuis la liste à plat renvoyée par GET /categories. */
export function buildCategoryTree(flat: Category[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  flat.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

interface CategoryTreeProps {
  categories: Category[];
  selectedId?: string | null;
  onSelect?: (category: CategoryNode) => void;
  className?: string;
}

export function CategoryTree({ categories, selectedId, onSelect, className }: CategoryTreeProps) {
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  const renderNode = (node: CategoryNode, depth: number) => (
    <div key={node.id}>
      <button
        type="button"
        onClick={() => onSelect?.(node)}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
          selectedId === node.id && 'bg-primary/10 font-medium text-primary',
        )}
        style={{ paddingLeft: `${(depth + 1) * 16}px` }}
      >
        {node.children.length > 0 ? (
          <ChevronRight strokeWidth={1.5} className="h-3.5 w-3.5 rotate-90 opacity-50" />
        ) : (
          <Folder strokeWidth={1.5} className="h-3.5 w-3.5 opacity-40" />
        )}
        {node.name}
      </button>
      {node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return <div className={cn('space-y-0.5', className)}>{tree.map((n) => renderNode(n, 0))}</div>;
}
