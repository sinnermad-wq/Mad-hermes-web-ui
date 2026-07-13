import { useState, type ReactNode } from 'react';
import './Tabs.css';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value?: T;
  onChange?: (next: T) => void;
  defaultValue?: T;
}

export function Tabs<T extends string>({ items, value, onChange, defaultValue }: TabsProps<T>) {
  const [internal, setInternal] = useState<T | undefined>(defaultValue);
  const active = value ?? internal ?? items[0]?.id;
  return (
    <div className="tabs" role="tablist" aria-orientation="horizontal">
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            className={'tab' + (isActive ? ' active' : '')}
            onClick={() => {
              if (value === undefined) setInternal(it.id);
              onChange?.(it.id);
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabStripProps {
  title: string;
  sub?: string;
  right?: ReactNode;
}

export function TabStrip({ title, sub, right }: TabStripProps) {
  return (
    <div className="tab-strip">
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div style={{ flex: '0 0 auto' }}>{right}</div>
    </div>
  );
}
