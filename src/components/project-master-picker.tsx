import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  categoryLabels,
  isProjectCatalogItemActive,
  resolveRecentProjects,
  searchProjectCatalog,
} from '../lib/input-board';
import type { ProjectCatalogItem } from '../types/input-board';

interface ProjectMasterPickerProps {
  catalog: ProjectCatalogItem[];
  recentProjectCodes: string[];
  value: string;
  selectedProjectCode: string;
  placeholder?: string;
  autoFocus?: boolean;
  onValueChange: (value: string) => void;
  onSelect: (project: ProjectCatalogItem) => void;
  onSelectComplete?: () => void;
}

interface ProjectSuggestionSection {
  title: string;
  projects: ProjectCatalogItem[];
  emptyMessage?: string;
}

function buildProjectOptionId(listboxId: string, projectCode: string) {
  return `${listboxId}-${projectCode.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'option'}`;
}

export function ProjectMasterPicker({
  catalog,
  recentProjectCodes,
  value,
  selectedProjectCode,
  placeholder = 'PJCD / PJ名で検索',
  autoFocus = false,
  onValueChange,
  onSelect,
  onSelectComplete,
}: ProjectMasterPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const [activeProjectCode, setActiveProjectCode] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const hasQuery = value.trim() !== '';
  const activeCatalog = useMemo(() => catalog.filter((project) => isProjectCatalogItemActive(project)), [catalog]);
  const selectedProject = useMemo(
    () => activeCatalog.find((project) => project.projectCode === selectedProjectCode) ?? null,
    [activeCatalog, selectedProjectCode],
  );
  const closedDisplayValue = selectedProject?.projectName?.trim() || value;
  const inputValue = isOpen ? value : closedDisplayValue;
  const pinnedProjects = useMemo(() => activeCatalog.filter((project) => project.pinned), [activeCatalog]);
  const recentProjects = useMemo(
    () => resolveRecentProjects(activeCatalog, recentProjectCodes, { excludePinned: true }),
    [activeCatalog, recentProjectCodes],
  );
  const searchResults = useMemo(
    () => (hasQuery ? searchProjectCatalog(activeCatalog, value, { recentProjectCodes }).slice(0, 8) : []),
    [activeCatalog, hasQuery, recentProjectCodes, value],
  );

  const suggestionSections = useMemo<ProjectSuggestionSection[]>(
    () =>
      hasQuery
        ? [
            {
              title: '検索結果',
              projects: searchResults,
              emptyMessage: '該当するPJがありません',
            },
          ]
        : [
            {
              title: 'ピン留めPJ',
              projects: pinnedProjects,
            },
            {
              title: '最近使ったPJ',
              projects: recentProjects,
            },
          ],
    [hasQuery, pinnedProjects, recentProjects, searchResults],
  );

  const keyboardProjects = useMemo(
    () => suggestionSections.flatMap((section) => section.projects),
    [suggestionSections],
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveProjectCode(null);
      return;
    }

    if (keyboardProjects.length === 0) {
      setActiveProjectCode(null);
      return;
    }

    if (activeProjectCode && keyboardProjects.some((project) => project.projectCode === activeProjectCode)) {
      return;
    }

    const nextActiveProject =
      keyboardProjects.find((project) => project.projectCode === selectedProjectCode) ?? keyboardProjects[0];
    setActiveProjectCode(nextActiveProject.projectCode);
  }, [activeProjectCode, isOpen, keyboardProjects, selectedProjectCode]);

  function closeDropdown() {
    setIsOpen(false);
    setActiveProjectCode(null);
  }

  function handleSelect(project: ProjectCatalogItem) {
    onSelect(project);
    closeDropdown();
    onSelectComplete?.();
  }

  function moveActiveProject(delta: 1 | -1) {
    if (keyboardProjects.length === 0) {
      return;
    }

    const currentIndex = keyboardProjects.findIndex((project) => project.projectCode === activeProjectCode);
    const fallbackIndex = delta > 0 ? 0 : keyboardProjects.length - 1;
    const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const nextIndex = (baseIndex + delta + keyboardProjects.length) % keyboardProjects.length;
    setActiveProjectCode(keyboardProjects[nextIndex].projectCode);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      moveActiveProject(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      moveActiveProject(-1);
      return;
    }

    if (event.key === 'Home' && isOpen && keyboardProjects.length > 0) {
      event.preventDefault();
      setActiveProjectCode(keyboardProjects[0].projectCode);
      return;
    }

    if (event.key === 'End' && isOpen && keyboardProjects.length > 0) {
      event.preventDefault();
      setActiveProjectCode(keyboardProjects[keyboardProjects.length - 1].projectCode);
      return;
    }

    if (event.key === 'Enter' && isOpen) {
      const activeProject =
        keyboardProjects.find((project) => project.projectCode === activeProjectCode) ?? keyboardProjects[0] ?? null;
      if (activeProject) {
        event.preventDefault();
        handleSelect(activeProject);
      }
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (event.key === 'Tab' && isOpen) {
      closeDropdown();
    }
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownStyle(null);
      return;
    }

    function updateDropdownPosition() {
      const anchorRect = inputRef.current?.getBoundingClientRect();
      if (!anchorRect) {
        return;
      }

      const width = Math.min(anchorRect.width, window.innerWidth - 24);
      const dropdownHeight = dropdownRef.current?.offsetHeight ?? 320;
      const availableBelow = window.innerHeight - anchorRect.bottom - 12;
      const availableAbove = anchorRect.top - 12;
      const shouldOpenAbove = availableBelow < 220 && availableAbove > availableBelow;
      const maxHeight = Math.max(180, shouldOpenAbove ? availableAbove - 8 : availableBelow - 8);
      const visibleHeight = Math.min(dropdownHeight, maxHeight);
      const left = Math.min(Math.max(anchorRect.left, 12), window.innerWidth - width - 12);
      const top = shouldOpenAbove
        ? Math.max(12, anchorRect.top - visibleHeight - 8)
        : Math.min(anchorRect.bottom + 8, window.innerHeight - visibleHeight - 12);

      setDropdownStyle({
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      });
    }

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen, hasQuery, pinnedProjects.length, recentProjects.length, searchResults.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (pickerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }

      closeDropdown();
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      closeDropdown();
      inputRef.current?.blur();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen]);

  const activeOptionId = activeProjectCode ? buildProjectOptionId(listboxId, activeProjectCode) : undefined;

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          className="project-picker__dropdown project-picker__dropdown--portal"
          style={dropdownStyle ?? undefined}
          role="listbox"
          id={listboxId}
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestionSections.map((section) => (
            <ProjectSuggestionGroup
              key={section.title}
              listboxId={listboxId}
              title={section.title}
              projects={section.projects}
              activeProjectCode={activeProjectCode}
              selectedProjectCode={selectedProjectCode}
              emptyMessage={section.emptyMessage}
              onSelect={handleSelect}
              onHoverProject={setActiveProjectCode}
            />
          ))}

          {!hasQuery && pinnedProjects.length === 0 && recentProjects.length === 0 && (
            <div className="project-picker__empty">候補がまだありません。</div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="project-picker" ref={pickerRef}>
      <input
        ref={inputRef}
        type="search"
        value={inputValue}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        title={closedDisplayValue}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            const activeElement = document.activeElement;
            if (
              (activeElement instanceof Node && pickerRef.current?.contains(activeElement)) ||
              (activeElement instanceof Node && dropdownRef.current?.contains(activeElement))
            ) {
              return;
            }

            closeDropdown();
          }, 0);
        }}
        onKeyDown={handleInputKeyDown}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {dropdown}
    </div>
  );
}

interface ProjectSuggestionGroupProps {
  listboxId: string;
  title: string;
  projects: ProjectCatalogItem[];
  activeProjectCode: string | null;
  selectedProjectCode: string;
  onSelect: (project: ProjectCatalogItem) => void;
  onHoverProject: (projectCode: string) => void;
  emptyMessage?: string;
}

function ProjectSuggestionGroup({
  listboxId,
  title,
  projects,
  activeProjectCode,
  selectedProjectCode,
  onSelect,
  onHoverProject,
  emptyMessage,
}: ProjectSuggestionGroupProps) {
  return (
    <section className="project-picker__group">
      <div className="project-picker__group-title">{title}</div>

      {projects.length === 0 ? (
        <div className="project-picker__empty">{emptyMessage ?? '候補がまだありません。'}</div>
      ) : (
        <div className="project-picker__options">
          {projects.map((project) => (
            <button
              key={project.projectCode}
              id={buildProjectOptionId(listboxId, project.projectCode)}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={selectedProjectCode === project.projectCode}
              className={
                activeProjectCode === project.projectCode
                  ? 'project-picker__option is-active'
                  : 'project-picker__option'
              }
              onMouseEnter={() => onHoverProject(project.projectCode)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(project);
              }}
            >
              <strong>{project.projectCode}</strong>
              <span>{project.projectName}</span>
              <small>{categoryLabels[project.category]}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
