import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Pencil,
  Trash2,
  X,
  Search,
  Loader,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { Tabs, TabStrip } from '../../components/UI/Tabs';
import { StatusBadge, type BadgeTone } from '../../components/UI/Badge';
import {
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  togglePinned,
  getPinnedIds,
  type SessionItem,
  type ListSessionsOpts,
} from '../../api/client';
import './Sessions.css';

type SessionsTab = 'recent' | 'pinned' | 'archived';

const tabs = [
  { id: 'recent' as const, label: 'Recent' },
  { id: 'pinned' as const, label: 'Pinned' },
  { id: 'archived' as const, label: 'Archived' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sourceTone(s: SessionItem['source']): BadgeTone {
  if (s === 'cron') return 'info';
  if (s === 'cli') return 'pending';
  if (s === 'gateway' || s === 'telegram') return 'ok';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  session: SessionItem;
  onConfirm: (id: string) => Promise<void>;
  onClose: () => void;
}

function DeleteConfirmModal({ session, onConfirm, onClose }: DeleteConfirmProps) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await onConfirm(session.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Delete session?</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p>
            This will <strong>permanently delete</strong>{' '}
            <em>"{session.title}"</em> and all its messages.
          </p>
          <p className="modal-warning">
            <AlertCircle size={14} /> This cannot be undone.
          </p>
          <p className="modal-hint">
            Consider archiving instead — archived sessions are hidden but not
            deleted.
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rename modal
// ---------------------------------------------------------------------------

interface RenameModalProps {
  session: SessionItem;
  onSave: (id: string, title: string) => Promise<void>;
  onClose: () => void;
}

function RenameModal({ session, onSave, onClose }: RenameModalProps) {
  const [value, setValue] = useState(session.title);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === session.title) {
      onClose();
      return;
    }
    setLoading(true);
    try {
      await onSave(session.id, trimmed);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Rename session</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            className="rename-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onClose();
            }}
            maxLength={120}
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={loading || !value.trim()}
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New session modal
// ---------------------------------------------------------------------------

interface NewSessionModalProps {
  onCreate: (content: string, title?: string) => Promise<void>;
  onClose: () => void;
}

function NewSessionModal({ onCreate, onClose }: NewSessionModalProps) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleCreate() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onCreate(trimmed, title.trim() || undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New session</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <textarea
            ref={textareaRef}
            className="rename-input"
            style={{ resize: 'vertical', minHeight: 80 }}
            value={content}
            placeholder="What would you like to discuss?"
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreate();
              if (e.key === 'Escape') onClose();
            }}
            maxLength={2000}
          />
          <input
            className="rename-input"
            type="text"
            placeholder="Session title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <p className="modal-hint">
            Press <kbd>Ctrl+Enter</kbd> to send, or fill in the title and click "Start session".
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={loading || !content.trim()}
          >
            {loading ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session actions menu
// ---------------------------------------------------------------------------

interface SessionActionsProps {
  session: SessionItem;
  isPinned: boolean;
  onRename: (s: SessionItem) => void;
  onArchive: (s: SessionItem) => void;
  onUnarchive: (s: SessionItem) => void;
  onPin: (id: string) => void;
  onDelete: (s: SessionItem) => void;
}

function SessionActions({
  session,
  isPinned,
  onRename,
  onArchive,
  onUnarchive,
  onPin,
  onDelete,
}: SessionActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const isArchived = session.status === 'archived';

  return (
    <div className="session-actions" ref={menuRef}>
      <button
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Session actions"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="actions-menu">
          {/* Rename */}
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onRename(session);
            }}
          >
            <Pencil size={13} /> Rename
          </button>

          {/* Pin / Unpin */}
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onPin(session.id);
            }}
          >
            {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
            {isPinned ? 'Unpin' : 'Pin'}
          </button>

          {/* Archive / Unarchive */}
          {isArchived ? (
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onUnarchive(session);
              }}
            >
              <ArchiveRestore size={13} /> Restore
            </button>
          ) : (
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onArchive(session);
              }}
            >
              <Archive size={13} /> Archive
            </button>
          )}

          {/* Delete */}
          <button
            className="menu-item menu-item-danger"
            onClick={() => {
              setOpen(false);
              onDelete(session);
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

interface SessionCardProps {
  session: SessionItem;
  isPinned: boolean;
  onRename: (s: SessionItem) => void;
  onArchive: (s: SessionItem) => void;
  onUnarchive: (s: SessionItem) => void;
  onPin: (id: string) => void;
  onDelete: (s: SessionItem) => void;
}

function SessionCard({
  session,
  isPinned,
  onRename,
  onArchive,
  onUnarchive,
  onPin,
  onDelete,
}: SessionCardProps) {
  return (
    <div className={`session-card${isPinned ? ' session-card--pinned' : ''}`}>
      <div className="title-row">
        <span className="title" title={session.title}>
          {session.title}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isPinned && (
            <Pin size={12} className="pin-icon" aria-label="Pinned" />
          )}
          <StatusBadge
            tone={sourceTone(session.source)}
            label={session.source}
          />
          {session.unread ? (
            <span className="badge info no-dot" style={{ fontSize: 10, padding: '0 6px' }}>
              {session.unread} new
            </span>
          ) : null}
        </div>
      </div>

      <div className="meta">
        <span>{session.id}</span>
        <span>·</span>
        <span>{session.messageCount} msgs</span>
        <span>·</span>
        <span>{fmtRelative(session.lastActiveAt)}</span>
      </div>

      <div className="preview">{session.preview}</div>

      <div className="card-foot">
        <StatusBadge
          tone={
            session.status === 'active'
              ? 'ok'
              : session.status === 'error'
              ? 'err'
              : session.status === 'archived'
              ? 'info'
              : 'pending'
          }
          label={session.status}
        />
        <SessionActions
          session={session}
          isPinned={isPinned}
          onRename={onRename}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onPin={onPin}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SessionsPage() {
  const [tab, setTab] = useState<SessionsTab>('recent');
  const [search, setSearch] = useState('');
  const [allItems, setAllItems] = useState<SessionItem[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [renameTarget, setRenameTarget] = useState<SessionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionItem | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);

  // Load pinned IDs from localStorage on mount
  useEffect(() => {
    setPinnedIds(getPinnedIds());
  }, []);

  // Fetch sessions when tab changes
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter: ListSessionsOpts['filter'] =
        tab === 'recent' ? 'recent' : tab === 'pinned' ? 'pinned' : 'archived';
      const items = await listSessions({ filter, search });
      if (items === null) {
        setError('Failed to load sessions — is the backend running?');
        setAllItems([]);
      } else {
        setAllItems(items);
      }
    } catch (e) {
      setError(String(e));
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Sort: pinned first, then by lastActiveAt
  const displayed = [...allItems].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
    const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreate(content: string, title?: string) {
    const created = await createSession({ content, title });
    if (created) {
      setAllItems((prev) => [created, ...prev]);
      setShowNewSession(false);
    }
  }

  async function handleRename(id: string, title: string) {
    const updated = await updateSession(id, { title });
    if (updated) {
      setAllItems((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    }
  }

  async function handleArchive(session: SessionItem) {
    const updated = await updateSession(session.id, { archived: true });
    if (updated) {
      // Move out of current view
      setAllItems((prev) => prev.filter((s) => s.id !== session.id));
    }
  }

  async function handleUnarchive(session: SessionItem) {
    const updated = await updateSession(session.id, { archived: false });
    if (updated) {
      setAllItems((prev) => prev.filter((s) => s.id !== session.id));
      // Reload to show in correct tab
      load();
    }
  }

  function handlePin(id: string) {
    const newPinned = togglePinned(id);
    setPinnedIds(newPinned);
  }

  async function handleDelete(id: string) {
    const ok = await deleteSession(id);
    if (ok) {
      setAllItems((prev) => prev.filter((s) => s.id !== id));
    }
    // If 501 (backend stub), still remove from UI but warn
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function emptyMessage() {
    if (search) return `No sessions matching "${search}"`;
    if (tab === 'pinned') return 'No pinned sessions yet.';
    if (tab === 'archived') return 'Archive is empty.';
    return 'No recent sessions.';
  }

  return (
    <div className="sessions-page">
      <TabStrip
        title="Sessions"
        sub={
          search
            ? `search: "${search}" · ${displayed.length} results`
            : `${tab} · ${displayed.length} sessions`
        }
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Tabs<SessionsTab> items={tabs} value={tab} onChange={setTab} />
            <button
              className="btn-new-session"
              onClick={() => setShowNewSession(true)}
              title="New session"
            >
              <Plus size={15} />
              <span>New</span>
            </button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="sessions-search-bar">
        <Search size={14} className="search-icon" />
        <input
          className="sessions-search-input"
          type="search"
          placeholder="Search sessions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="sessions-grid">
        {loading ? (
          <div className="sessions-state">
            <Loader size={24} className="spin" />
            <span>Loading sessions…</span>
          </div>
        ) : error ? (
          <div className="sessions-state sessions-state--error">
            <AlertCircle size={24} />
            <span>{error}</span>
            <button className="btn-secondary" onClick={load}>
              Retry
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="sessions-state">
            <span className="empty-title">{emptyMessage()}</span>
            {!search && (
              <span className="empty-hint">
                Use the ⋮ menu on a session to pin, archive, or delete it.
              </span>
            )}
          </div>
        ) : (
          displayed.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              isPinned={pinnedIds.includes(s.id)}
              onRename={setRenameTarget}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onPin={handlePin}
              onDelete={setDeleteTarget}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {renameTarget && (
        <RenameModal
          session={renameTarget}
          onSave={handleRename}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          session={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {showNewSession && (
        <NewSessionModal
          onCreate={handleCreate}
          onClose={() => setShowNewSession(false)}
        />
      )}
    </div>
  );
}