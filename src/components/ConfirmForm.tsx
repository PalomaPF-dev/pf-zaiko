"use client";

import { useRef } from "react";

/**
 * 破壊的操作（削除など）を confirm ダイアログで確認してから Server Action を実行するフォーム。
 */
export default function ConfirmForm({
  action,
  message,
  children,
  className = "",
}: {
  action: (fd: FormData) => void | Promise<void>;
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {children}
    </form>
  );
}
