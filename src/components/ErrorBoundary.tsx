import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button } from '@capra/core';

interface Props {
  children: ReactNode;
  /** Changes reset the boundary, e.g. the route path. */
  resetKey?: string;
}

interface State {
  error?: Error;
}

/** Catches render errors in a page so the navigation and the other pages keep working. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Task Manager page error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-alert" style={{ paddingTop: 16 }}>
          <Alert
            appearance="danger"
            title="This page hit an error"
            action={<Button size="sm" onClick={() => this.setState({ error: undefined })}>Try again</Button>}
          >
            {this.state.error.message}
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}
