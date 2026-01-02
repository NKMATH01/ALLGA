// Simplified toast implementation
export const Toaster = () => null;

export const useToast = () => {
  return {
    toast: (props: { title: string; description?: string; variant?: 'default' | 'destructive' }) => {
      alert(`${props.title}${props.description ? '\n' + props.description : ''}`);
    },
  };
};
