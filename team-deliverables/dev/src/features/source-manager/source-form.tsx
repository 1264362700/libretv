'use client';

import { useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { useTranslation } from '@/lib/i18n';
import { validateSourceUrl } from '@/lib/utils';


export function SourceForm({
  visible,
  initial,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  initial?: { key: string; name: string; url: string; detail?: string; isAdult?: boolean };
  onCancel: () => void;
  onSubmit: (data: { name: string; url: string; detail?: string; isAdult?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [isAdult, setIsAdult] = useState(initial?.isAdult ?? false);
  const { toast } = useToast();

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setUrl(initial?.url ?? '');
      setDetail(initial?.detail ?? '');
      setIsAdult(initial?.isAdult ?? false);
    }
  }, [visible, initial]);

  if (!visible) return null;

  const submit = () => {
    const n = name.trim();
    const u = url.trim().replace(/\/+$/, '');
    if (!n || !u) {
      toast(t('admin.addApi'), 'warning');
      return;
    }
    if (!validateSourceUrl(u)) {
      toast(t('admin.addApiInvalid'), 'warning');
      return;
    }
    onSubmit({ name: n, url: u, detail: detail.trim() || undefined, isAdult });
  };

  return (
    <div className="space-y-2 border border-line rounded-lg p-3 bg-chip mb-2">
    <input
      className="input w-full"
      aria-label={t('admin.panelSourceName')}
      placeholder={t('admin.panelName')}
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
    <input
      className="input w-full"
      aria-label={t('admin.panelApiUrl')}
      placeholder={t('admin.panelApiUrlPlaceholder')}
      value={url}
      onChange={(e) => setUrl(e.target.value)}
    />
    <input
      className="input w-full"
      aria-label={t('admin.panelDetail')}
      placeholder={t('admin.panelDetailPlaceholder')}
      value={detail}
      onChange={(e) => setDetail(e.target.value)}
    />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-pink-500"
          checked={isAdult}
          onChange={(e) => setIsAdult(e.target.checked)}
        />
        {t('admin.panelAdultSource')}
      </label>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost btn-sm" onClick={onCancel}>
          {t('admin.panelCancel')}
        </button>
        <button className="btn-primary btn-sm" onClick={submit}>
          {initial ? t('admin.update') : t('admin.add')}
        </button>
      </div>
    </div>
  );
}
