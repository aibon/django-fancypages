from django import template
from django.db.models import Q, get_model

from ..utils import get_page_model


PageGroup = get_model('fancypages', 'PageGroup')
FancyPage = get_page_model()


register = template.Library()


def build_tree(root, parent, data, depth):
    for instance in data[depth]:
        if not parent or instance.is_child_of(parent):
            node = (instance, [])
            if depth < len(data) - 1:
                build_tree(node[1], instance, data, depth + 1)
            root.append(node)
    return root


@register.assignment_tag
def get_pages(group):
    """
    Get pages within the same page group where *group* is the slug of the
    PageGroup object. Only visible pages within this group are returned and
    are not reflecting their tree structure. A simple queryset is returned.
    """
    if isinstance(group, PageGroup):
        group = group.slug
    return FancyPage._default_manager.visible(groups__slug=group)


@register.assignment_tag
def get_page_tree(group=None, depth=1, relative_to=None):
    depth_offset = 0
    pages = FancyPage.objects.all()

    if relative_to:
        depth_offset = relative_to.depth
        pages = pages.filter(
            Q(node__path__startswith=relative_to.path) &
            ~Q(node__path=relative_to.path))

    pages = pages.filter(node__depth__lte=(depth + depth_offset))

    if group:
        if isinstance(group, PageGroup):
            group = group.slug
        pages = pages.filter(groups__slug=group)

    page_buckets = [[] for i in range(depth)]
    for page in pages:
        page_buckets[page.depth - depth_offset - 1].append(page)

    page_subtree = []
    build_tree(page_subtree, None, page_buckets, 0)

    return page_subtree
