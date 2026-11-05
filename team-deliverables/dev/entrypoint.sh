#!/bin/sh
set -e

# 如果当前以 root 权限运行，自动修正宿主机挂载的 /app/data 目录所有者与读写权限
if [ "$(id -u)" = "0" ]; then
  if [ -d "/app/data" ]; then
    chown -R nextjs:nodejs /app/data 2>/dev/null || chmod -R 777 /app/data 2>/dev/null || true
  fi
  # 平滑降权至 nextjs 用户执行服务
  exec su-exec nextjs node server.js
else
  # 容器已按非 root 运行时直接执行
  exec node server.js
fi
