export const SEARCHABLE_SELECT_ROOT_ATTR = "data-searchable-select-root";
export const SEARCHABLE_SELECT_DROPDOWN_ATTR = "data-searchable-select-dropdown";
export const SEARCH_MULTI_SELECT_ROOT_ATTR = "data-search-multi-select-root";
export const SEARCH_MULTI_SELECT_DROPDOWN_ATTR = "data-search-multi-select-dropdown";

const SELECT_SURFACE_SELECTORS = [
  `[${SEARCHABLE_SELECT_ROOT_ATTR}='true']`,
  `[${SEARCHABLE_SELECT_DROPDOWN_ATTR}='true']`,
  `[${SEARCH_MULTI_SELECT_ROOT_ATTR}='true']`,
  `[${SEARCH_MULTI_SELECT_DROPDOWN_ATTR}='true']`,
].join(", ");

export function isWithinSelectSurface(target: EventTarget | null) {
  return target instanceof Element ? Boolean(target.closest(SELECT_SURFACE_SELECTORS)) : false;
}
