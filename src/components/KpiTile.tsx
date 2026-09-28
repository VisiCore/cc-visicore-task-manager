import type { ReactNode } from 'react';
import { Card, Text } from '@capra/core';

interface KpiTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** Optional element on the right of the value: a Pill, a Sparkline, a Meter. */
  aside?: ReactNode;
  footer?: ReactNode;
  span?: number;
  tone?: 'ok' | 'warning' | 'danger' | 'accent' | 'none';
}

export function KpiTile({ label, value, detail, aside, footer, span = 3, tone = 'none' }: KpiTileProps) {
  return (
    <div className={`kpi tone-${tone}`} style={{ gridColumn: `span ${span}` }}>
      <Card>
        <Card.Content>
          <div className="kpi-body">
            <div className="kpi-main">
              <span className="panel-title">{label}</span>
              <Text as="div" variant="metric-md">{value}</Text>
              {detail !== undefined && (
                <Text as="div" variant="body-sm-normal" color="subtle">
                  {detail}
                </Text>
              )}
            </div>
            {aside !== undefined && <div className="kpi-aside">{aside}</div>}
          </div>
          {footer !== undefined && <div className="kpi-footer">{footer}</div>}
        </Card.Content>
      </Card>
    </div>
  );
}
