package com.ecommerce.order_service.service;

import com.ecommerce.order_service.dto.OrderRequest;
import com.ecommerce.order_service.dto.OrderResponse;
import com.ecommerce.order_service.model.OrderStatus;

import java.util.List;

public interface OrderService {
    OrderResponse placeOrder(OrderRequest orderRequest, String userId); // Create
    //List<OrderResponse> getAllOrders();                  // Read All
    List<OrderResponse> getOrders(String userId, boolean isAdmin);                  // Read All x userId
    OrderResponse getOrderById(Long id);                 // Read One
    void deleteOrder(Long id);                           // Delete
    void updateOrderStatus(String orderNumber, OrderStatus newStatus);
}
