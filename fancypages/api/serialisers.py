from django.db.models import get_model
from django.utils.translation import ugettext as _
from django.template import loader, RequestContext

from rest_framework import serializers

from .. import library
from ..library import get_block_form

FancyPage = get_model('fancypages', 'FancyPage')
ContentBlock = get_model('fancypages', 'ContentBlock')
OrderedContainer = get_model('fancypages', 'OrderedContainer')


class RenderFormFieldMixin(object):
    form_template_name = None
    context_object_name = 'object'

    def get_rendered_form(self, obj):
        request = self.context.get('request')
        if not request or 'includeForm' not in request.GET:
            return u''

        form_class = self.get_form_class(obj)
        form_kwargs = self.get_form_kwargs(obj)

        tmpl = loader.get_template(self.form_template_name)
        ctx = RequestContext(
            self.context['request'],
            {
                self.context_object_name: obj,
                'form': form_class(**form_kwargs),
            }
        )
        return tmpl.render(ctx)

    def get_form_kwargs(self, obj):
        return {
            'instance': obj,
        }

    def get_form_class(self, obj):
        return get_block_form(obj.__class__)


class BlockSerializer(RenderFormFieldMixin, serializers.ModelSerializer):
    form_template_name = "fancypages/dashboard/block_update.html"
    context_object_name = 'block'

    display_order = serializers.IntegerField(required=False, default=-1)
    code = serializers.CharField(required=True)
    rendered_form = serializers.SerializerMethodField('get_rendered_form')

    def restore_object(self, attrs, instance=None):
        code = attrs.pop('code')

        if instance is None:
            block_class = library.get_content_block(code)
            if block_class:
                self.opts.model = block_class

        return super(BlockSerializer, self).restore_object(attrs, instance)

    def get_form_class(self, obj):
        return get_block_form(self.object.__class__)

    class Meta:
        model = ContentBlock


class BlockMoveSerializer(serializers.ModelSerializer):
    container = serializers.PrimaryKeyRelatedField()
    index = serializers.IntegerField(source='display_order')

    class Meta:
        model = ContentBlock
        read_only_fields = ['display_order']


class OrderedContainerSerializer(serializers.ModelSerializer):
    content_type = serializers.PrimaryKeyRelatedField()
    title = serializers.CharField(required=False, default=_("New Tab"))

    def restore_object(self, attrs, instance=None):
        instance = super(OrderedContainerSerializer, self).restore_object(
            attrs,
            instance
        )
        if instance is not None:
            instance.display_order = instance.page_object.tabs.count()
        return instance

    class Meta:
        model = OrderedContainer
        exclude = ['display_order']


class PageMoveSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField('get_page_title')
    is_visible = serializers.SerializerMethodField('get_visibility')

    parent = serializers.IntegerField(required=True)
    new_index = serializers.IntegerField()
    old_index = serializers.IntegerField(required=True)

    def get_page_title(self):
        return self.object.name

    def get_visibility(self):
        return self.object.is_visible

    def save(self, *args, **kwargs):
        obj = super(PageMoveSerializer, self).save(*args, **kwargs)
        if obj.new_index <= obj.old_index:
            position = 'left'
        else:
            position = 'right'

        # if the parent ID is '0' the page will be moved to the
        # root level. That means we have to lookup the root node
        # that we use to relate the move to. This is the root node
        # at the position of the new_index. If it is the last node
        # the index will cause a IndexError so we insert the page
        # after the last node.
        if not obj.parent:
            try:
                page = FancyPage.get_root_nodes()[obj.new_index]
            except IndexError:
                page = FancyPage.get_last_root_node()
                position = 'right'

        # in this case the page is moved relative to a parent node.
        # we have to handle the same special case for the last node
        # as above and also have to insert as 'first-child' if no
        # other children are present due to different relative node
        else:
            page = FancyPage.objects.get(id=obj.parent)
            if not page.numchild:
                position = 'first-child'
            else:
                try:
                    page = page.get_children()[obj.new_index]
                except IndexError:
                    position = 'last-child'
        obj.move(page, position)
        return obj

    class Meta:
        model = FancyPage
        fields = ['parent', 'new_index', 'old_index']
        read_only_fields = ['status']
