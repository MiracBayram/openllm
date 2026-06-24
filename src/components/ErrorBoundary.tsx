import { Component, ComponentChildren } from 'preact';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Icon } from './ui/Icon';

interface Props {
  children: ComponentChildren;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-forge-bg text-forge-text flex items-center justify-center p-6">
          <div className="bg-forge-surface border border-forge-danger/20 rounded-2xl p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6 items-center text-center">
            <div className="w-16 h-16 rounded-full bg-forge-danger/10 flex items-center justify-center text-forge-danger">
              <Icon icon={AlertTriangle} size={32} />
            </div>
            
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold">Fatal Error Encountered</h1>
              <p className="text-forge-text-secondary text-sm">
                Forge encountered an unexpected error and could not continue rendering.
              </p>
            </div>
            
            {this.state.error && (
              <div className="w-full bg-black/30 rounded-lg p-4 overflow-x-auto text-left border border-forge-border-subtle custom-scrollbar max-h-48">
                <code className="text-forge-danger text-xs font-mono whitespace-pre-wrap">
                  {this.state.error.toString()}
                </code>
              </div>
            )}
            
            <button
              onClick={() => window.location.reload()}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-forge-accent text-white px-6 py-3 rounded-xl font-medium hover:bg-forge-accent-hover transition-colors"
            >
              <Icon icon={RefreshCw} size={18} />
              Reload Forge
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
