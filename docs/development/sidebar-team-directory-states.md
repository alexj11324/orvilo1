# Sidebar team directory states

The Teams section distinguishes initial loading, failed empty loads and successful empty results. Its skeleton uses the same 32px row and 16px icon geometry as team items; collapsed mode hides label placeholders. The actual request error reaches AsyncError so sign-in and permission recovery remain available. Retry is disabled while revalidation is pending, and the Teams directory link remains reachable after failure. A cached nonempty list remains visible through background refresh errors, preserving the existing navigation behavior.
