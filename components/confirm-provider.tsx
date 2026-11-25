"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ConfirmOptions = {
  title: string
  description?: string
  actionLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void
}

const ConfirmContext = React.createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null
)

export function useConfirm() {
  const confirm = React.useContext(ConfirmContext)
  if (!confirm) {
    throw new Error("useConfirm must be used within a ConfirmProvider")
  }
  return confirm
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState | null>(null)

  const confirm = React.useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open && state) {
        state.resolve(false)
        setState(null)
      }
    },
    [state]
  )

  const handleConfirm = React.useCallback(() => {
    if (state) {
      state.resolve(true)
      setState(null)
    }
  }, [state])

  const handleCancel = React.useCallback(() => {
    if (state) {
      state.resolve(false)
      setState(null)
    }
  }, [state])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={Boolean(state)} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.title}</AlertDialogTitle>
            {state?.description ? (
              <AlertDialogDescription>{state.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {state?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={state?.variant ?? "default"}
              onClick={handleConfirm}
            >
              {state?.actionLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
