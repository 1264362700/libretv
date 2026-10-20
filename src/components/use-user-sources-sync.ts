'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './auth';
import { useAppStore } from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SourceConfig } from '@/lib/types';
import type { SourceSubscription } from '@/lib/store';

/**
 * 用户个性化搜索源与订阅配置 —— Neon 数据库云端双向实时同步 Hook
 * 1. 登录成功自动从 Neon 主库加载用户的 customSources, selectedKeys, subscriptions
 * 2. 首次登录若云端为空且本地已有源，自动向上迁移归档至 Neon
 * 3. 源配置发生任何变动时，防抖 800ms 自动保存至 Neon 数据库 user_configs 表
 */
export function useUserSourcesSync() {
  const { user, verified } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const initialLoadedRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. 当用户登录状态变更时，从 Neon 主库拉取配置
  useEffect(() => {
    if (!verified || !user?.username) {
      initialLoadedRef.current = null;
      return;
    }

    const currentUsername = user.username;
    if (initialLoadedRef.current === currentUsername) return;

    let isMounted = true;
    setSyncing(true);

    api.user
      .getSources()
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.config) {
          const remote = res.config;
          const store = useAppStore.getState();

          // 云端已有真实配置
          if (remote.updatedAt) {
            const remoteCustoms = (Array.isArray(remote.customSources) ? remote.customSources : []) as SourceConfig[];
            const remoteSelected = (Array.isArray(remote.selectedKeys) ? remote.selectedKeys : []) as string[];
            const remoteSubs = (Array.isArray(remote.subscriptions) ? remote.subscriptions : []) as SourceSubscription[];

            // 智能合并或覆盖：以云端最新数据为准
            useAppStore.setState({
              customAPIs: remoteCustoms,
              selectedKeys: remoteSelected.length > 0 ? remoteSelected : store.selectedKeys,
              subscriptions: remoteSubs,
            });
            setLastSyncedAt(remote.updatedAt);
            setSyncError(null);
          } else {
            // 云端为空（首次接入新库），若本地已有源，自动首发同步至 Neon 归档
            const localCustoms = store.customAPIs || [];
            const localSelected = store.selectedKeys || [];
            const localSubs = store.subscriptions || [];

            if (localCustoms.length > 0 || localSubs.length > 0) {
              api.user
                .saveSources({
                  customSources: localCustoms,
                  selectedKeys: localSelected,
                  subscriptions: localSubs,
                })
                .then((saveRes) => {
                  if (saveRes.success) {
                    setLastSyncedAt(Date.now());
                  }
                })
                .catch(() => {});
            }
          }
        }
        initialLoadedRef.current = currentUsername;
      })
      .catch((err) => {
        if (isMounted) setSyncError(err instanceof Error ? err.message : '云端同步失败');
      })
      .finally(() => {
        if (isMounted) setSyncing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [verified, user?.username]);

  // 2. 监听本地配置变化，防抖自动保存至 Neon
  useEffect(() => {
    if (!verified || !user?.username) return;

    // 订阅 store 的核心配置变更
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      // 首次加载未完成前不反向推送，避免覆盖
      if (initialLoadedRef.current !== user.username) return;

      const customChanged = state.customAPIs !== prevState.customAPIs;
      const selectedChanged = state.selectedKeys !== prevState.selectedKeys;
      const subsChanged = state.subscriptions !== prevState.subscriptions;

      if (!customChanged && !selectedChanged && !subsChanged) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        setSyncing(true);

        try {
          const res = await api.user.saveSources({
            customSources: state.customAPIs,
            selectedKeys: state.selectedKeys,
            subscriptions: state.subscriptions,
          });

          if (res.success) {
            setLastSyncedAt(Date.now());
            setSyncError(null);
          } else {
            setSyncError(res.error || '保存至 Neon 失败');
          }
        } catch (err) {
          setSyncError(err instanceof Error ? err.message : '网络保存异常');
        } finally {
          isSavingRef.current = false;
          setSyncing(false);
        }
      }, 800);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [verified, user?.username]);

  // 手动触发立即保存
  const triggerManualSave = useCallback(async () => {
    if (!verified || !user?.username) return false;
    const store = useAppStore.getState();
    setSyncing(true);
    try {
      const res = await api.user.saveSources({
        customSources: store.customAPIs,
        selectedKeys: store.selectedKeys,
        subscriptions: store.subscriptions,
      });
      if (res.success) {
        setLastSyncedAt(Date.now());
        setSyncError(null);
        return true;
      }
      setSyncError(res.error || '保存失败');
      return false;
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : '保存异常');
      return false;
    } finally {
      setSyncing(false);
    }
  }, [verified, user?.username]);

  return {
    syncing,
    lastSyncedAt,
    syncError,
    triggerManualSave,
  };
}
