import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[OpenCode Webview] React render error:",
      error,
      info.componentStack,
    );
    // Store component stack for display
    (this as any)._componentStack = info.componentStack;
    this.forceUpdate();
  }

  render() {
    if (this.state.error) {
      const stack = (this as any)._componentStack ?? "";
      return (
        <div
          style={{
            padding: 16,
            color: "var(--vscode-errorForeground, #f44)",
            overflow: "auto",
            maxHeight: "100vh",
          }}
        >
          <h3>Something went wrong</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 11,
              opacity: 0.9,
              marginBottom: 8,
            }}
          >
            {this.state.error.message}
          </pre>
          <details open>
            <summary style={{ cursor: "pointer", fontSize: 12 }}>
              Stack trace
            </summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 10,
                opacity: 0.7,
                marginTop: 4,
              }}
            >
              {this.state.error.stack}
            </pre>
          </details>
          {stack && (
            <details open>
              <summary style={{ cursor: "pointer", fontSize: 12 }}>
                Component stack
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 10,
                  opacity: 0.7,
                  marginTop: 4,
                }}
              >
                {stack}
              </pre>
            </details>
          )}
          <button
            style={{ marginTop: 8, cursor: "pointer" }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
