import type { ReactNode } from 'react';
import { Card } from '@capra/core';

interface PanelProps {
  title: string;
  /** Right-aligned readout next to the title (a value, a tag, a toggle). */
  readout?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Grid span within the 12-column page grid. */
  span?: number;
  minHeight?: number;
}

/** A TMOG-style instrument panel: uppercase title strip, readout, and a content well. */
export function Panel({ title, readout, actions, children, span = 12, minHeight }: PanelProps) {
  return (
    <div className="panel" style={{ gridColumn: `span ${span}`, minHeight }}>
      <Card>
        <div className="panel-head">
          <span className="panel-title">{title}</span>
          {readout !== undefined && <span className="panel-readout">{readout}</span>}
          {actions !== undefined && <span className="panel-actions">{actions}</span>}
        </div>
        <Card.Content>
          <div className="panel-body">{children}</div>
        </Card.Content>
      </Card>
    </div>
  );
}
