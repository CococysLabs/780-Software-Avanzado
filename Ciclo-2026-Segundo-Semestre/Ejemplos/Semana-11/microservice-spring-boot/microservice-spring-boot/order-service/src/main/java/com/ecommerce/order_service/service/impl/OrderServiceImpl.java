package com.ecommerce.order_service.service.impl;

import com.ecommerce.order_service.dto.OrderRequest;
import com.ecommerce.order_service.dto.OrderResponse;
import com.ecommerce.order_service.event.OrderPlacedEvent;
import com.ecommerce.order_service.exception.ResourceNotFoundException;
import com.ecommerce.order_service.mapper.OrderMapper;
import com.ecommerce.order_service.model.Order;
import com.ecommerce.order_service.model.OrderStatus;
import com.ecommerce.order_service.model.OutboxEvent;
import com.ecommerce.order_service.repository.OrderRepository;
import com.ecommerce.order_service.service.OrderService;
//import com.ecommerce.order_service.service.client.InventoryClient;
//import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
//import io.github.resilience4j.retry.annotation.Retry;
import com.ecommerce.order_service.service.OutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
@RefreshScope
public class OrderServiceImpl implements OrderService {
    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;
    private final RabbitTemplate rabbitTemplate;
    private final OutboxService outboxService;

    @Value("${order.enabled:true}")
    private boolean ordersEnabled;

    public OrderResponse fallbackMethod(OrderRequest orderRequest, String userId, Throwable throwable){
            log.error("🛑 Circuit Breaker activado. Causa: {}", throwable.getMessage());
            throw new RuntimeException("El Servicio de Inventario no responde. Por favor intente más tarde.");
    }

    @Override
    @Transactional
    public OrderResponse placeOrder(OrderRequest orderRequest, String userId) {

            if(!ordersEnabled){
                log.warn("Pedido rechazado: Servicio deshabilitado por configuración.");
                throw new RuntimeException("El servicio de pedidos está actualmente en mantenimiento. Intente más tarde");
            }

            log.info("Colocando nuevo pedido");

            Order order = orderMapper.toOrder(orderRequest);
            order.setUserId(userId);
            order.setOrderNumber(UUID.randomUUID().toString());
            order.setStatus(OrderStatus.PLACED);
            Order savedOrder = orderRepository.save(order);

            List<OrderPlacedEvent.OrderItemEvent> orderItems =
                    order.getOrderLineItemsList().stream()
                                    .map(item -> new OrderPlacedEvent.OrderItemEvent(
                                            item.getSku(), item.getPrice().toString(), item.getQuantity()
                                    )).toList();

            OrderPlacedEvent event = new OrderPlacedEvent(
                    savedOrder.getOrderNumber(), orderRequest.getEmail(), orderItems
            );

        boolean sentToRabbit = false;
        try {
            rabbitTemplate.convertAndSend("order-events", "order.placed", event);
            sentToRabbit = true;
            log.info("🚀 Mensaje enviado inmediatamente a RabbitMQ: {}", savedOrder.getOrderNumber());
        } catch (AmqpException e) {
            log.error("⚠️ RabbitMQ caído. El Outbox asegurará el envío posterior para la orden: {}", savedOrder.getOrderNumber());
        }

        outboxService.saveOrderPlacedEvent(event, sentToRabbit);

            log.info("Evento enviado a RabbitMQ para la orden: {}", savedOrder.getOrderNumber());

            return orderMapper.toOrderResponse(savedOrder);
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderResponse> getOrders(String userId, boolean isAdmin) {
        List<Order> orders;

        if(isAdmin){
            orders = orderRepository.findAll();
        }else{
            orders = orderRepository.findByUserId(userId);
        }

        return orders.stream()
                .map(orderMapper::toOrderResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrderById(Long id) {

        Order order = orderRepository.findById(id)
                .orElseThrow(
                        () -> new ResourceNotFoundException("Orden", "id", id)
                );

        return orderMapper.toOrderResponse(order);
    }

    @Override
    @Transactional
    public void deleteOrder(Long id) {

        if(!orderRepository.existsById(id)){
            throw new ResourceNotFoundException("Orden", "id", id);
        }

        orderRepository.deleteById(id);
        log.info("Orden eliminada. ID: {}", id);
    }

    @Override
    @Transactional
    public void updateOrderStatus(String orderNumber, OrderStatus newStatus) {
        log.info("🔄 Actualizando base de datos: Orden {} -> {}", orderNumber, newStatus);

        orderRepository.findByOrderNumber(orderNumber).ifPresentOrElse(
                order -> {
                    order.setStatus(newStatus);
                    orderRepository.save(order);
                    log.info("✅ Estado actualizado en DB para la orden: {}", orderNumber);
                },
                () -> log.error("❌ No se encontró la orden {} para actualizar", orderNumber)
        );
    }


}
