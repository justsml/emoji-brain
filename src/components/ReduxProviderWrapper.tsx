import React from 'react';
import { Provider } from 'react-redux';
import { store } from '../store/store'; // Adjust path if necessary

interface ReduxProviderWrapperProps {
  children: React.ReactNode;
}

/**
 * A wrapper component that provides the Redux store to its children.
 * This is necessary for integrating Redux with React components rendered
 * within an Astro project using client directives.
 */
const ReduxProviderWrapper: React.FC<ReduxProviderWrapperProps> = ({ children }) => {
  return <Provider store={store}>{children}</Provider>;
};

export default ReduxProviderWrapper;