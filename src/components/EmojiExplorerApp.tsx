import React from "react";
import { useSelector } from "react-redux";
import type { EmojiMetadata } from "../types/emoji";
import SearchBar from "./SearchBar";
import EmojiGrid from "./EmojiGrid";
import { EmojiExport } from "./EmojiExport";
import {
  selectSearchQuery,
  selectSelectedCategory,
} from "../store/searchSlice";
import { selectSelectedEmojis } from "../store/selectionSlice";
import ReduxProviderWrapper from "./ReduxProviderWrapper";
// Import actions if needed for initialization, e.g., setting initial emojis if not passed via props

interface EmojiExplorerAppProps {
  initialEmojis: EmojiMetadata[];
  categories: string[];
}

const EmojiExplorerWrapper = (props: EmojiExplorerAppProps) => {
  const EmojiExplorerApp = _EmojiExplorerApp;
  return (
    <ReduxProviderWrapper>
      <EmojiExplorerApp {...props} />;
    </ReduxProviderWrapper>
  );
};
const _EmojiExplorerApp: React.FC<EmojiExplorerAppProps> = ({
  initialEmojis,
  categories,
}) => {
  // const dispatch = useDispatch();
  const searchQuery = useSelector(selectSearchQuery);
  const selectedCategory = useSelector(selectSelectedCategory);
  const selectedEmojis = useSelector(selectSelectedEmojis);

  // Filtering logic based on Redux state
  const filteredEmojis = React.useMemo(() => {
    let filtered = initialEmojis;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (emoji) =>
          emoji.filename.toLowerCase().includes(query) ||
          (emoji.tags &&
            emoji.tags.some((tag) => tag.toLowerCase().includes(query))) ||
          (emoji.categories &&
            emoji.categories.some((category) =>
              category.toLowerCase().includes(query)
            ))
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (emoji) =>
          emoji.categories && emoji.categories.includes(selectedCategory)
      );
    }

    return filtered;
  }, [initialEmojis, searchQuery, selectedCategory]);

  // Example: Dispatch an action on mount if needed
  // useEffect(() => {
  //   dispatch(someInitializationAction(initialEmojis));
  // }, [dispatch, initialEmojis]);

  return (
      <div className="space-y-8">
        <div className="max-w-5xl mx-auto">
          <SearchBar categories={categories} />
        </div>

        <section className="max-w-7xl mx-auto">
          <EmojiGrid emojis={filteredEmojis} />
        </section>

        <EmojiExport />
      </div>
  );
};

export default EmojiExplorerWrapper;
